# task-management

A Jira/Linear-inspired task management REST API. Built this to sharpen my skills around backend architecture, containerization, CI/CD, and Kubernetes — not just a CRUD app.

![CI/CD](https://github.com/lukmanul-khakim/task-management/actions/workflows/ci.yml/badge.svg)
![Docker Pulls](https://img.shields.io/docker/pulls/lukmankhakim09/task-management)
![Node](https://img.shields.io/badge/node-20-green)
![License](https://img.shields.io/badge/license-MIT-brightgreen)

---

## What it does

Users can create **workspaces** (think: organizations), invite teammates with role-based access (Owner / Admin / Member), spin up **projects** with short identifiers (like `ENG`, `DEV`), and manage **tickets** within those projects — complete with status, priority, assignee, due date, and an automatic activity log that tracks every change.

```
Workspace
  └── Project (ENG, DEV, ...)
        └── Ticket (ENG-1, ENG-2, ...)
              └── Activity log (auto-logged on every update)
```

---

## Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 20, TypeScript |
| Framework | NestJS |
| Database | PostgreSQL 16 + Prisma ORM |
| Cache / Token store | Redis 7 |
| Auth | JWT (access + refresh with rotation) |
| Docs | Swagger / OpenAPI |
| Container | Docker (multi-stage build) |
| Orchestration | Kubernetes (k3s) |
| CI/CD | GitHub Actions → Docker Hub |
| Testing | Jest (unit + e2e) + Supertest |

---

## Project structure

```
task-management/
├── .github/
│   └── workflows/
│       └── ci.yml           # test → build → push → deploy
├── k8s/
│   ├── namespace.yml
│   ├── configmap.yml
│   ├── secret.yml
│   ├── pvc.yml
│   ├── deployment.yml
│   └── service.yml
├── prisma/
│   └── schema.prisma
├── src/
│   ├── auth/                # register, login, logout, refresh
│   ├── workspace/           # CRUD + member management + roles
│   ├── project/             # CRUD + archive
│   ├── ticket/              # CRUD + pagination + activity log
│   ├── common/
│   │   ├── guards/          # JwtAuthGuard, RolesGuard
│   │   ├── decorators/      # @CurrentUser(), @Public(), @Roles()
│   │   ├── filters/         # global exception filter
│   │   └── interceptors/    # response wrapper
│   ├── prisma/              # PrismaService
│   ├── health/              # liveness + readiness endpoints
│   └── main.ts
├── __tests__/               # e2e tests
├── Dockerfile
├── docker-compose.yml
└── prisma.config.ts
```

---

## Running locally

Prerequisites: Node.js 20+, Docker

```bash
# Clone and install
git clone https://github.com/lukmanul-khakim/task-management
cd task-management
npm install

# Environment setup
cp .env.example .env
# Edit .env — generate JWT secrets with:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Start postgres + redis
docker compose up -d postgres redis

# Run migrations
npx prisma migrate dev --name init

# Start dev server
npm run start:dev
```

App runs at `http://localhost:3000/api/v1`
Swagger docs at `http://localhost:3000/api/docs`

---

## API overview

### Auth
```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

### Workspaces
```
POST   /api/v1/workspaces
GET    /api/v1/workspaces
GET    /api/v1/workspaces/:slug
PATCH  /api/v1/workspaces/:slug
DELETE /api/v1/workspaces/:slug

POST   /api/v1/workspaces/:slug/members/invite
GET    /api/v1/workspaces/:slug/members
PATCH  /api/v1/workspaces/:slug/members/:memberId/role
DELETE /api/v1/workspaces/:slug/members/:memberId
```

### Projects
```
POST   /api/v1/workspaces/:slug/projects
GET    /api/v1/workspaces/:slug/projects
GET    /api/v1/workspaces/:slug/projects/:identifier
PATCH  /api/v1/workspaces/:slug/projects/:identifier
PATCH  /api/v1/workspaces/:slug/projects/:identifier/archive
DELETE /api/v1/workspaces/:slug/projects/:identifier
```

### Tickets
```
POST   /api/v1/workspaces/:slug/projects/:identifier/tickets
GET    /api/v1/workspaces/:slug/projects/:identifier/tickets
GET    /api/v1/workspaces/:slug/projects/:identifier/tickets/:number
PATCH  /api/v1/workspaces/:slug/projects/:identifier/tickets/:number
DELETE /api/v1/workspaces/:slug/projects/:identifier/tickets/:number
GET    /api/v1/workspaces/:slug/projects/:identifier/tickets/:number/activity
```

Full request/response docs available at `/api/docs` (Swagger).

---

## Auth flow

Access tokens expire in 15 minutes. Refresh tokens are single-use — every `/refresh` call rotates the token. If a refresh token is reused (i.e. someone replays a stolen token), all refresh tokens for that user get wiped immediately.

```
POST /auth/login
→ { accessToken, refreshToken }

# 15 min later, access token expires
POST /auth/refresh  { refreshToken }
→ { accessToken, refreshToken }  ← new pair, old token invalidated
```

---

## CI/CD pipeline

Every push to `main` triggers:

```
push to main
     │
     ▼
[test]
  ├── spin up postgres + redis containers
  ├── run migrations
  ├── jest unit tests + coverage report
  └── jest e2e tests
     │
     ▼ (only if tests pass)
[build-and-push]
  ├── docker buildx multi-stage build
  ├── tag: latest + sha-xxxxxxx
  └── push to Docker Hub (lukmankhakim09/task-management)
     │
     ▼
[deploy]
  ├── connect to k3s via Tailscale
  ├── kubectl set image (rolling update)
  ├── wait for rollout
  └── verify pods
```

Images are tagged with both `:latest` and `:sha-<commit>`. In production, always pin to the SHA tag — `:latest` is convenient but not safe for rollbacks.

---

## Kubernetes

Runs on k3s (self-hosted, local Ubuntu server). Manifests are in `k8s/`:

- `namespace.yml` — isolated namespace
- `configmap.yml` — non-sensitive env vars
- `secret.yml` — DB credentials, JWT secrets (never committed with real values)
- `pvc.yml` — persistent storage for postgres (5Gi) and redis (1Gi)
- `deployment.yml` — app (2 replicas), postgres, redis with liveness/readiness probes
- `service.yml` — ClusterIP for internal services, NodePort for app

Rolling update strategy ensures there's always at least one healthy pod serving traffic during deploys.

### Deploy manually

```bash
# Apply all manifests
kubectl apply -f k8s/namespace.yml
kubectl apply -f k8s/pvc.yml
kubectl apply -f k8s/configmap.yml
kubectl apply -f k8s/secret.yml
kubectl apply -f k8s/deployment.yml
kubectl apply -f k8s/service.yml

# Run migrations
kubectl port-forward -n task-management svc/postgres-service 5433:5432 &
DATABASE_URL="postgresql://tmuser:PASSWORD@localhost:5433/taskmanagement?schema=public" \
  npx prisma migrate deploy
```

---

## Testing

```bash
npm run test        # unit tests
npm run test:cov    # unit tests + coverage report
npm run test:e2e    # e2e tests (needs postgres + redis running)
```

Unit tests mock Prisma completely — fast, no DB required. E2e tests hit a real test database and cover full request lifecycle including auth headers, status codes, and activity log entries.

---

## Known limitations

- Ticket numbers are auto-incremented per project (`ENG-1`, `ENG-2`) and not recycled when tickets are deleted
- No file attachments
- No real-time updates (WebSocket not implemented)
- Workspace invite by email assumes user already registered — email delivery not implemented
- k3s runs on local Ubuntu (VirtualBox), accessible remotely via Tailscale

---

## License

MIT

