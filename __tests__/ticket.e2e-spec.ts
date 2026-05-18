import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { TicketStatus, TicketPriority } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('Tickets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let workspaceSlug: string;
  let projectIdentifier: string;

  const suffix = Date.now();
  const testUser = {
    name: 'Ticket Tester',
    email: `ticket-test-${suffix}@example.com`,
    password: 'StrongPass123!',
  };

  // ─── Setup ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    const reflector = app.get(Reflector);
    app.useGlobalGuards(new JwtAuthGuard(reflector));
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    prisma = app.get(PrismaService);

    // Register + login
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(testUser);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password });

    accessToken = loginRes.body.data.accessToken;

    // Create workspace
    workspaceSlug = `test-ws-${suffix}`;
    await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Test Workspace', slug: workspaceSlug });

    // Create project
    projectIdentifier = 'TST';
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceSlug}/projects`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Test Project',
        identifier: projectIdentifier,
      });
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { slug: workspaceSlug } });
    await prisma.user.deleteMany({ where: { email: testUser.email } });
    await app.close();
  });

  const base = () =>
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectIdentifier}/tickets`;

  // ─── Create ───────────────────────────────────────────────────────────────

  describe('POST /tickets', () => {
    it('should create a ticket with number 1', async () => {
      const res = await request(app.getHttpServer())
        .post(base())
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'First ticket' })
        .expect(201);

      expect(res.body.data.number).toBe(1);
      expect(res.body.data.title).toBe('First ticket');
      expect(res.body.data.status).toBe(TicketStatus.BACKLOG);
    });

    it('should auto-increment ticket number', async () => {
      const res = await request(app.getHttpServer())
        .post(base())
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Second ticket', priority: TicketPriority.HIGH })
        .expect(201);

      expect(res.body.data.number).toBe(2);
      expect(res.body.data.priority).toBe(TicketPriority.HIGH);
    });

    it('should return 400 for missing title', async () => {
      await request(app.getHttpServer())
        .post(base())
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });

    it('should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .post(base())
        .send({ title: 'Unauthorized' })
        .expect(401);
    });
  });

  // ─── List ─────────────────────────────────────────────────────────────────

  describe('GET /tickets', () => {
    it('should return paginated ticket list', async () => {
      const res = await request(app.getHttpServer())
        .get(base())
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data.meta).toBeDefined();
      expect(res.body.data.meta.total).toBeGreaterThanOrEqual(2);
    });

    it('should filter by status', async () => {
      const res = await request(app.getHttpServer())
        .get(`${base()}?status=${TicketStatus.BACKLOG}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      res.body.data.data.forEach((t: any) => {
        expect(t.status).toBe(TicketStatus.BACKLOG);
      });
    });
  });

  // ─── Get one ──────────────────────────────────────────────────────────────

  describe('GET /tickets/:number', () => {
    it('should return ticket with activity log', async () => {
      const res = await request(app.getHttpServer())
        .get(`${base()}/1`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.number).toBe(1);
      expect(res.body.data.activities).toBeDefined();
      expect(res.body.data.activities.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.activities[0].action).toBe('CREATED');
    });

    it('should return 404 for non-existent ticket', async () => {
      await request(app.getHttpServer())
        .get(`${base()}/9999`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  // ─── Update ───────────────────────────────────────────────────────────────

  describe('PATCH /tickets/:number', () => {
    it('should update status and auto-log activity', async () => {
      await request(app.getHttpServer())
        .patch(`${base()}/1`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: TicketStatus.IN_PROGRESS })
        .expect(200);

      // Verify activity was logged
      const actRes = await request(app.getHttpServer())
        .get(`${base()}/1/activity`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const statusLog = actRes.body.data.find(
        (a: any) => a.action === 'STATUS_CHANGED',
      );
      expect(statusLog).toBeDefined();
      expect(statusLog.metadata.from).toBe(TicketStatus.BACKLOG);
      expect(statusLog.metadata.to).toBe(TicketStatus.IN_PROGRESS);
    });

    it('should update priority and log activity', async () => {
      await request(app.getHttpServer())
        .patch(`${base()}/1`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ priority: TicketPriority.URGENT })
        .expect(200);

      const actRes = await request(app.getHttpServer())
        .get(`${base()}/1/activity`)
        .set('Authorization', `Bearer ${accessToken}`);

      const priorityLog = actRes.body.data.find(
        (a: any) => a.action === 'PRIORITY_CHANGED',
      );
      expect(priorityLog).toBeDefined();
      expect(priorityLog.metadata.to).toBe(TicketPriority.URGENT);
    });
  });

  // ─── Delete ───────────────────────────────────────────────────────────────

  describe('DELETE /tickets/:number', () => {
    it('should delete a ticket', async () => {
      await request(app.getHttpServer())
        .delete(`${base()}/2`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`${base()}/2`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});

