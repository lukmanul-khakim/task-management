# Setup Guide

## Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Git

---

## Step 1 — Install NestJS CLI & scaffold project

```bash
npm install -g @nestjs/cli
nest new task-management
cd task-management
```

---

## Step 2 — Install dependencies

```bash
# Core
npm install @prisma/client @nestjs/jwt @nestjs/passport passport passport-jwt \
  bcryptjs class-validator class-transformer @nestjs/config

# Redis
npm install @nestjs/cache-manager cache-manager ioredis

# Swagger
npm install @nestjs/swagger swagger-ui-express

# Dev
npm install -D prisma @types/passport-jwt @types/bcryptjs \
  ts-jest @nestjs/testing supertest @types/supertest
```

---

## Step 3 — Copy config files

Replace / merge these files from this repo into your NestJS project:

| Source                          | Destination                     | Action  |
|---------------------------------|---------------------------------|---------|
| `.gitignore`                    | `.gitignore`                    | Replace |
| `.env.example`                  | `.env.example`                  | Replace |
| `tsconfig.json`                 | `tsconfig.json`                 | Replace |
| `jest.config.ts`                | `jest.config.ts`                | Replace |
| `package.scripts.json`          | merge into `package.json`       | Merge scripts section |
| `prisma/schema.prisma`          | `prisma/schema.prisma`          | Replace |
| `src/main.ts`                   | `src/main.ts`                   | Replace |
| `src/app.module.ts`             | `src/app.module.ts`             | Replace |
| `src/prisma/`                   | `src/prisma/`                   | Copy folder |
| `src/health/`                   | `src/health/`                   | Copy folder |

---

## Step 4 — Setup environment

```bash
cp .env.example .env
```

Edit `.env` — generate strong JWT secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Run twice — once for `JWT_ACCESS_SECRET`, once for `JWT_REFRESH_SECRET`.

---

## Step 5 — Start infrastructure

```bash
docker compose up -d

# Verify all services healthy
docker compose ps
```

Expected output:
```
NAME          STATUS
tm-postgres   running (healthy)
tm-redis      running (healthy)
```

---

## Step 6 — Run Prisma migration

```bash
npx prisma migrate dev --name init
```

This will:
1. Create all tables from `schema.prisma`
2. Generate the Prisma Client

---

## Step 7 — Start the app

```bash
npm run start:dev
```

Verify:
- App: http://localhost:3002/api/v1/health
- Swagger: http://localhost:3002/api/docs
- Prisma Studio: `docker compose --profile studio up` → http://localhost:5555

---

## Next modules to build

In this order (each depends on the previous):

1. `src/prisma/` ✅ done
2. `src/common/` — guards, decorators, filters
3. `src/auth/` — register, login, logout, JWT refresh
4. `src/workspace/` — CRUD + member management
5. `src/project/` — CRUD + archive
6. `src/ticket/` — CRUD + activity log

