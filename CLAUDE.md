# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run start:dev          # hot-reload dev server
npm run build              # compile to dist/
npm run start:prod         # run compiled output

# Linting & formatting
npm run lint               # eslint --fix on src/ and __tests__/
npm run format             # prettier --write

# Testing
npm run test               # unit tests only (src/**/*.spec.ts)
npm run test:watch         # unit tests in watch mode
npm run test:cov           # unit tests + coverage report
npm run test:e2e           # e2e tests (requires postgres + redis)
npm run test:all           # unit + e2e with coverage

# Run a single test file
npx jest --selectProjects unit src/auth/auth.service.spec.ts
npx jest --selectProjects e2e __tests__/auth.e2e-spec.ts

# Database
npm run db:migrate         # prisma migrate dev (dev — creates migration files)
npm run db:migrate:prod    # prisma migrate deploy (prod — no interactive prompts)
npm run db:generate        # regenerate Prisma Client after schema changes
npm run db:seed            # run prisma/seed.ts
npm run db:studio          # open Prisma Studio
npm run db:reset           # reset DB and re-run all migrations (destructive)

# Infrastructure (local dev)
docker compose up -d postgres redis   # start only DB services
docker compose up -d                  # start all services (app on port 3002)
docker compose --profile studio up    # also start Prisma Studio on :5555
```

After `npm run start:dev`, the app is at `http://localhost:3000/api/v1` and Swagger at `http://localhost:3000/api/docs`. When running via docker compose, the app is on port 3002 externally.

## Architecture

### Module structure

```
AppModule
  ├── PrismaModule (global)
  ├── AuthModule
  ├── WorkspaceModule
  ├── ProjectModule
  ├── TicketModule
  └── HealthModule
```

Each feature module follows the standard NestJS layout: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, and `*.spec.ts` co-located alongside source files.

### Path aliases (tsconfig + jest)

Import feature modules using aliases, not relative paths:

| Alias | Resolves to |
|---|---|
| `@auth/*` | `src/auth/*` |
| `@workspace/*` | `src/workspace/*` |
| `@project/*` | `src/project/*` |
| `@ticket/*` | `src/ticket/*` |
| `@common/*` | `src/common/*` |
| `@prisma-service/*` | `src/prisma/*` |
| `@redis/*` | `src/redis/*` |

### Global middleware chain

Applied in `main.ts` to every request:

1. **`JwtAuthGuard`** — validates Bearer token on all routes. Use `@Public()` decorator to opt out on specific routes.
2. **`ValidationPipe`** — strips unknown fields (`whitelist: true`), rejects them (`forbidNonWhitelisted: true`), transforms primitives (`enableImplicitConversion: true`).
3. **`ResponseInterceptor`** — wraps every successful response: `{ success: true, data: <payload>, timestamp: "..." }`.
4. **`AllExceptionsFilter`** — catches all exceptions and returns: `{ statusCode, message, error, path, timestamp }`.

### Redis caching

`RedisService` (`src/redis/redis.service.ts`) is a `@Global()` module — inject it anywhere without importing `RedisModule`. It wraps ioredis with graceful degradation: if Redis is down, `get` returns `null` and `set`/`del` are no-ops, so the app keeps working without cache.

Cache key: `workspace:id:{slug}` → workspace ID string, TTL 5 minutes.

- **Set** in: `WorkspaceMemberGuard` (on cache miss), `ProjectService.getWorkspaceOrThrow`, `TicketService.getProjectOrThrow`
- **Invalidated** in: `WorkspaceService.update`, `WorkspaceService.remove`

`CacheKeys` helper in `redis.service.ts` generates all cache keys — use it instead of hardcoding strings.

Unit test mocks for `RedisService`:
```typescript
const mockRedis = {
  get: jest.fn().mockResolvedValue(null), // default: cache miss
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
};
// then: { provide: RedisService, useValue: mockRedis }
```

### Authorization guard chain (workspace routes)

Workspace and nested routes (projects, tickets) use a two-guard chain applied at the controller level:

1. **`WorkspaceMemberGuard`** — looks up the workspace by `:slug`, verifies the current user is a member, and attaches `request.workspace` and `request.workspaceMemberRole` for downstream use.
2. **`RolesGuard`** — reads `@Roles()` metadata from the handler and compares against `request.workspaceMemberRole`. Routes without `@Roles()` allow any workspace member.

### Auth — JWT token rotation

- Access tokens: 15 min, signed with `JWT_ACCESS_SECRET`
- Refresh tokens: 7 days, signed with `JWT_REFRESH_SECRET`, stored in the `refresh_tokens` table
- On every `/auth/refresh`: the used token is deleted and a new pair is issued (rotation)
- On refresh token reuse: **all** refresh tokens for that user are wiped immediately (theft detection)
- Logout deletes all refresh tokens for the user

### Ticket numbering and activity log

Ticket numbers (`ENG-1`, `ENG-2`) are auto-incremented per project by querying the max `number` in the project, then adding 1. Numbers are not recycled when tickets are deleted.

Every ticket mutation triggers `buildActivityLogs()` in `TicketService`, which compares old vs. new field values and creates `ActivityLog` records atomically inside the same Prisma `update` call. Each field change (status, priority, assignee, due date, title) maps to a specific `ActivityAction` enum value with a `{ field, from, to }` JSON metadata blob.

### Database schema key points

- `Workspace` is identified externally by `slug` (unique, URL-safe string)
- `Project` is identified by `(workspaceId, identifier)` composite unique — e.g. `ENG`, `DEV`
- `Ticket` is identified by `(projectId, number)` composite unique
- `WorkspaceMember` roles: `OWNER > ADMIN > MEMBER`
- `WorkspaceInvite` tokens are single-use with an `expiresAt` and `usedAt` timestamp

### Testing conventions

- **Unit tests** (`src/**/*.spec.ts`): mock `PrismaService` completely — no DB required. Controllers are excluded from coverage (covered by e2e). Run with `--selectProjects unit`.
- **E2e tests** (`__tests__/**/*.e2e-spec.ts`): hit a real test database using Supertest. Require postgres + redis running. Run with `--selectProjects e2e --runInBand`.
- Coverage thresholds: 60% branches, 70% functions/lines/statements.
