import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { ProjectStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('Projects (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const suffix = Date.now();
  const slug = `proj-ws-${suffix}`;
  const identifier = 'E2E';

  const owner = {
    name: 'Project Owner',
    email: `proj-owner-${suffix}@example.com`,
    password: 'StrongPass123!',
  };
  const regularMember = {
    name: 'Regular Member',
    email: `proj-member-${suffix}@example.com`,
    password: 'StrongPass123!',
  };

  let ownerToken: string;
  let memberToken: string;

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

    // Register owner
    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(owner);
    ownerToken = ownerRes.body.data.accessToken;

    // Register regular member and invite them
    const memberRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(regularMember);
    memberToken = memberRes.body.data.accessToken;

    // Create workspace
    await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Project Test WS', slug });

    // Invite regular member (MEMBER role — cannot create/delete projects)
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${slug}/members/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: regularMember.email });
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { slug } });
    await prisma.user.deleteMany({
      where: { email: { in: [owner.email, regularMember.email] } },
    });
    await app.close();
  });

  const base = () => `/api/v1/workspaces/${slug}/projects`;

  // ─── Create ───────────────────────────────────────────────────────────────

  describe('POST /projects', () => {
    it('should create project as OWNER', async () => {
      const res = await request(app.getHttpServer())
        .post(base())
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'E2E Project', identifier })
        .expect(201);

      expect(res.body.data.identifier).toBe(identifier);
      expect(res.body.data.status).toBe(ProjectStatus.ACTIVE);
    });

    it('should return 409 if identifier already taken in workspace', async () => {
      await request(app.getHttpServer())
        .post(base())
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Duplicate', identifier })
        .expect(409);
    });

    it('should return 403 if user is a regular MEMBER', async () => {
      await request(app.getHttpServer())
        .post(base())
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Unauthorized Project', identifier: 'UNX' })
        .expect(403);
    });

    it('should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .post(base())
        .send({ name: 'No Auth', identifier: 'NOA' })
        .expect(401);
    });
  });

  // ─── List ─────────────────────────────────────────────────────────────────

  describe('GET /projects', () => {
    it('should return only active projects by default', async () => {
      const res = await request(app.getHttpServer())
        .get(base())
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(
        res.body.data.every((p: any) => p.status === ProjectStatus.ACTIVE),
      ).toBe(true);
    });

    it('should be accessible to regular members', async () => {
      await request(app.getHttpServer())
        .get(base())
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);
    });
  });

  // ─── Get one ──────────────────────────────────────────────────────────────

  describe('GET /projects/:identifier', () => {
    it('should return project details with ticket count', async () => {
      const res = await request(app.getHttpServer())
        .get(`${base()}/${identifier}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data.identifier).toBe(identifier);
      expect(res.body.data).toHaveProperty('_count');
    });

    it('should return 404 for non-existent identifier', async () => {
      await request(app.getHttpServer())
        .get(`${base()}/XXX`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });

  // ─── Update ───────────────────────────────────────────────────────────────

  describe('PATCH /projects/:identifier', () => {
    it('should update project name as OWNER', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${base()}/${identifier}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Updated Project' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated Project');
    });

    it('should return 403 for regular MEMBER', async () => {
      await request(app.getHttpServer())
        .patch(`${base()}/${identifier}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Not Allowed' })
        .expect(403);
    });
  });

  // ─── Archive / Unarchive ──────────────────────────────────────────────────

  describe('PATCH /projects/:identifier/archive', () => {
    it('should archive an active project', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${base()}/${identifier}/archive`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data.status).toBe(ProjectStatus.ARCHIVED);
      expect(res.body.data.archivedAt).not.toBeNull();
    });

    it('should return 409 if project is already archived', async () => {
      await request(app.getHttpServer())
        .patch(`${base()}/${identifier}/archive`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(409);
    });

    it('should not appear in default project list after archiving', async () => {
      const res = await request(app.getHttpServer())
        .get(base())
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data.some((p: any) => p.identifier === identifier)).toBe(
        false,
      );
    });

    it('should appear when archived=true is passed', async () => {
      const res = await request(app.getHttpServer())
        .get(`${base()}?archived=true`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data.some((p: any) => p.identifier === identifier)).toBe(
        true,
      );
    });
  });

  describe('PATCH /projects/:identifier/unarchive', () => {
    it('should restore an archived project', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${base()}/${identifier}/unarchive`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.data.status).toBe(ProjectStatus.ACTIVE);
      expect(res.body.data.archivedAt).toBeNull();
    });

    it('should return 409 if project is already active', async () => {
      await request(app.getHttpServer())
        .patch(`${base()}/${identifier}/unarchive`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(409);
    });
  });

  // ─── Delete ───────────────────────────────────────────────────────────────

  describe('DELETE /projects/:identifier', () => {
    it('should return 403 if user is MEMBER', async () => {
      await request(app.getHttpServer())
        .delete(`${base()}/${identifier}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    it('should delete project as OWNER', async () => {
      await request(app.getHttpServer())
        .delete(`${base()}/${identifier}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`${base()}/${identifier}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });
});
