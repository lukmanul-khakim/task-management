import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { WorkspaceRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('Workspaces (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const suffix = Date.now();

  const owner = {
    name: 'Workspace Owner',
    email: `ws-owner-${suffix}@example.com`,
    password: 'StrongPass123!',
  };
  const member = {
    name: 'Workspace Member',
    email: `ws-member-${suffix}@example.com`,
    password: 'StrongPass123!',
  };

  let ownerToken: string;
  let memberToken: string;
  let memberId: string;
  const slug = `test-ws-${suffix}`;

  // ─── Setup ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    const reflector = app.get(Reflector);
    app.useGlobalGuards(new JwtAuthGuard(reflector));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    prisma = app.get(PrismaService);

    // Register owner + member
    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(owner);
    ownerToken = ownerRes.body.data.accessToken;

    const memberRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(member);
    memberToken = memberRes.body.data.accessToken;
    memberId = memberRes.body.data.user.id;
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { slug } });
    await prisma.user.deleteMany({
      where: { email: { in: [owner.email, member.email] } },
    });
    await app.close();
  });

  // ─── Create ───────────────────────────────────────────────────────────────

  describe('POST /api/v1/workspaces', () => {
    it('should create workspace and auto-add creator as OWNER', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Test Workspace', slug })
        .expect(201);

      expect(res.body.data.slug).toBe(slug);
      expect(res.body.data.name).toBe('Test Workspace');
    });

    it('should return 409 if slug is already taken', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Duplicate', slug })
        .expect(409);
    });

    it('should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/workspaces')
        .send({ name: 'No Auth', slug: `no-auth-${suffix}` })
        .expect(401);
    });
  });

  // ─── List ─────────────────────────────────────────────────────────────────

  describe('GET /api/v1/workspaces', () => {
    it('should return workspaces the user belongs to', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((w: any) => w.slug === slug)).toBe(true);
    });

    it('should not return workspaces the user has not joined', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body.data.some((w: any) => w.slug === slug)).toBe(false);
    });
  });

  // ─── Get one ──────────────────────────────────────────────────────────────

  describe('GET /api/v1/workspaces/:slug', () => {
    it('should return workspace with members list', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${slug}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data.slug).toBe(slug);
      expect(Array.isArray(res.body.data.members)).toBe(true);
    });

    it('should return 403 if user is not a member', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${slug}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    it('should return 404 for non-existent workspace', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/workspaces/does-not-exist')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });

  // ─── Update ───────────────────────────────────────────────────────────────

  describe('PATCH /api/v1/workspaces/:slug', () => {
    it('should update workspace name as OWNER', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${slug}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated Name');
    });
  });

  // ─── Members — invite ─────────────────────────────────────────────────────

  describe('POST /api/v1/workspaces/:slug/members/invite', () => {
    it('should invite an existing user by email', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${slug}/members/invite`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: member.email, role: WorkspaceRole.MEMBER })
        .expect(201);

      expect(res.body.data.role).toBe(WorkspaceRole.MEMBER);
    });

    it('should return 409 if user is already a member', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${slug}/members/invite`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: member.email })
        .expect(409);
    });

    it('should return 403 if requester is not OWNER or ADMIN', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${slug}/members/invite`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ email: 'other@example.com' })
        .expect(403);
    });
  });

  // ─── Members — list ───────────────────────────────────────────────────────

  describe('GET /api/v1/workspaces/:slug/members', () => {
    it('should return all workspace members', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${slug}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── Members — update role ────────────────────────────────────────────────

  describe('PATCH /api/v1/workspaces/:slug/members/:memberId/role', () => {
    it('should promote member to ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${slug}/members/${memberId}/role`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: WorkspaceRole.ADMIN })
        .expect(200);

      expect(res.body.data.role).toBe(WorkspaceRole.ADMIN);
    });

    it('should return 403 if trying to change own role', async () => {
      const ownerInfo = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${ownerToken}`);
      const ownerId = ownerInfo.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/workspaces/${slug}/members/${ownerId}/role`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: WorkspaceRole.MEMBER })
        .expect(403);
    });
  });

  // ─── Members — remove ─────────────────────────────────────────────────────

  describe('DELETE /api/v1/workspaces/:slug/members/:memberId', () => {
    it('should remove member from workspace', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${slug}/members/${memberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // Member should no longer have access
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${slug}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });
  });

  // ─── Delete ───────────────────────────────────────────────────────────────

  describe('DELETE /api/v1/workspaces/:slug', () => {
    it('should delete workspace as OWNER', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/workspaces/${slug}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${slug}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });
});
