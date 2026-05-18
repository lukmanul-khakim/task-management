import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testUser = {
    name: 'Test User',
    email: `test-${Date.now()}@example.com`,
    password: 'StrongPass123!',
  };

  let accessToken: string;
  let refreshToken: string;

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

    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Cleanup test user
    await prisma.user.deleteMany({ where: { email: testUser.email } });
    await app.close();
  });

  // ─── Register ─────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body.data.user.email).toBe(testUser.email);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user).not.toHaveProperty('hashedPassword');
    });

    it('should return 409 if email already exists', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(409);
    });

    it('should return 400 for invalid email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...testUser, email: 'not-an-email' })
        .expect(400);
    });

    it('should return 400 for weak password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ ...testUser, email: 'other@example.com', password: '123' })
        .expect(400);
    });
  });

  // ─── Login ────────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('should login and return tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();

      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('should return 401 for wrong password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: 'WrongPass123!' })
        .expect(401);
    });

    it('should return 401 for non-existent email', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'StrongPass123!' })
        .expect(401);
    });
  });

  // ─── Me ───────────────────────────────────────────────────────────────────

  describe('GET /api/v1/auth/me', () => {
    it('should return current user when authenticated', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.email).toBe(testUser.email);
    });

    it('should return 401 when no token provided', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });

    it('should return 401 for invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
    });
  });

  // ─── Refresh ──────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('should return new tokens with valid refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // Store new refresh token
      refreshToken = res.body.data.refreshToken;
    });

    it('should return 401 if refresh token is reused', async () => {
      // The old refreshToken was already rotated above
      const oldToken = refreshToken;
      // Rotate once more
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldToken })
        .expect(200);

      // Try to reuse the same token — should fail
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldToken })
        .expect(401);
    });
  });

  // ─── Logout ───────────────────────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('should logout and invalidate tokens', async () => {
      // Login fresh to get new tokens
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: testUser.email, password: testUser.password });

      const token = loginRes.body.data.accessToken;

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // After logout, /me should still work (access token valid until expiry)
      // but refresh should fail since refresh tokens are deleted
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: loginRes.body.data.refreshToken })
        .expect(401);
    });
  });
});

