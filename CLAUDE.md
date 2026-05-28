# sitephoto — AI Agent Orientation

Self-hosted photo gallery with albums, tags, timeline, GPS map, Nextcloud integration, and local AI features (duplicate detection, async people identification). Built with Express.js + plain JavaScript, deployed on two OVH Public Cloud instances connected over a private vRack network.

---

## Repository structure

| Directory / File | Purpose |
|---|---|
| `src/` | Main Express application (Instance-1) |
| `worker/` | Standalone Node.js BullMQ worker (Instance-2) |
| `infra/` | Terraform configs for OVH Public Cloud provisioning |
| `migrations/` | SQL schema migrations — source of truth for the DB schema |
| `docs/backlog/` | Backlog stories split by domain + STATUS.md tracking table |
| `docs/architecture/` | Architecture diagrams and design notes |
| `docs/history/` | Historical plans (V2, V3, V4 summary) |
| `docs/archive/` | Deprecated documents (kept for reference only) |
| `.claude/agents/` | Specialized agent system prompts |
| `docker-compose.yml` | Local dev: app + db + Redis + MinIO + worker |
| `docker-compose.prod.yml` | Production Instance-1: app + db + Redis (no MinIO) |
| `worker/docker-compose.yml` | Production Instance-2: worker only |
| `.env.example` | All env vars for Instance-1 (copy to `.env`) |
| `worker/.env.example` | All env vars for Instance-2 worker |
| `init-db.sql` | Docker init script — bootstraps a fresh DB from the latest migrations snapshot; do NOT add schema changes here |

---

## Key source modules

### `src/`

| File | Purpose |
|---|---|
| `server.js` | Entry point — creates `http.Server`, attaches socket.io, starts listening |
| `app.js` | Express app setup — middleware, routes, error handler |
| `db.js` | PostgreSQL pool (`pg`) — exported as `db.query()` |
| `migrate.js` | Runs `migrations/v*.sql` in order on startup |
| `storage.js` | S3 wrapper (`@aws-sdk/client-s3`) — `uploadPhoto`, `downloadPhoto`, `deletePhoto` |
| `notifications.js` | socket.io gateway — `initSocketIO(httpServer)` + `notifyUser(userId, payload)` |
| `uploadHelpers.js` | multer `memoryStorage` + S3 upload + `addIdentificationJob()` |
| `instance-lifecycle.js` | OVH API — unshelve/shelve Instance-2 automatically |
| `middleware.js` | `requireAuth`, `requireAdmin`, `requireEditor`, `wrapAsync` |
| `permissions.js` | Album sharing / viewer permission checks |
| `queue/producer.js` | BullMQ `addIdentificationJob({ photoId, userId, photoS3Key })` |
| `queue/events.js` | BullMQ queue events (triggers instance lifecycle) |
| `routes/internal.js` | `POST /internal/identification-result` and `POST /internal/describe-person-result` — worker callback, guarded by `requireWorkerSecret` |
| `routes/photos.js` | Photo CRUD, upload, delete |
| `routes/albums.js` | Album management + sharing |
| `routes/admin-ai.js` | Duplicate detection + manual AI trigger |

### `worker/src/`

| File | Purpose |
|---|---|
| `worker.js` | BullMQ processor — download from S3, call Ollama, post result back |
| `ai.js` | Ollama HTTP client — wraps the identify / describe calls |
| `storage.js` | S3 wrapper (copy of `src/storage.js`) |
| `instance1-api.js` | HTTP client to Instance-1 internal API (uses `INSTANCE1_API_URL` + `x-worker-secret` header) |

---

## Development commands

```bash
# Install dependencies
npm install

# Start dev server (nodemon, port 3000)
npm run dev

# Run tests (Jest, --forceExit)
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Full local stack (app + db + Redis + MinIO + worker)
cp .env.example .env
docker compose up -d --build

# Run migrations manually (also run automatically on startup)
node src/migrate.js
```

---

## Production architecture

Two OVH Public Cloud instances + one S3-compatible Object Storage bucket, connected over a private vRack (`10.0.0.0/24`):

- **Instance-1** (`b2-7`, 2 vCPU / 7 GB, always on) — Express app + PostgreSQL + Redis + Caddy. Ports 80/443 public; 6379 and 3001 on vRack only.
- **Instance-2** (`c3-8`, shelved when idle) — Node.js worker + Ollama (llava). No public ports; SSH only via Instance-1 jump host.
- **OVH Object Storage** — S3-compatible bucket; both instances access it directly (no file transit over vRack).

Worker callback flow: worker POSTs result to `Instance-1:3001/internal/identification-result` over the vRack. Instance-1 updates the DB and pushes a `identification-complete` WebSocket event to the browser.

See `infra/README.md` for full deployment runbook and `docs/architecture/architecture-v4.md` for diagrams.

---

## Schema and migrations

- `migrations/v*.sql` — numbered SQL files, applied in order at startup by `src/migrate.js`. **This is the source of truth.**
- `init-db.sql` — Docker init script that runs only on a completely fresh volume. Contains a snapshot equivalent to running all migrations. Do not add new schema changes here; add a new `migrations/vN.sql` file instead.
- Current files: `v1.sql` through `v9.sql`.

---

## AI agents

`.claude/agents/` contains system prompts for specialized agents. Each handles a distinct domain:

| File | Agent |
|---|---|
| `planner-improved.md` | Planner — breaks features into tasks |
| `tech-lead-improved.md` | Tech Lead — code review, architecture |
| `qa-agent-system-prompt.md` | QA — test coverage, test quality |
| `devops-improved.md` | DevOps — CI/CD, deploy workflows |
| `documentation-agent-improved.md` | Documentation — this agent |
| `security-agent-improved.md` | Security — vulnerability review |
| `product-owner-improved.md` | Product Owner — feature scoping |
| `website-dev-improved.md` | Website Dev — frontend implementation |

---

## Key constraints and gotchas

- **Internal API auth** — The worker authenticates to Instance-1 via the `x-worker-secret` HTTP header. Both sides must share the same `WORKER_API_SECRET` env var. Missing or wrong secret returns 403.
- **Worker uses `INSTANCE1_API_URL`** — full URL including host and port (e.g. `http://10.0.0.x:3001`). The variable `INTERNAL_API_PORT` appears only in Instance-1's `.env`; the worker does not read it.
- **socket.io on the same Express server** — `initSocketIO` attaches to the `http.Server` returned by `server.js`. The server-side `userSockets` Map in `notifications.js` maps `userId → Set<socketId>`; it is populated when a client connects via socket.io. When the worker posts its result to `/internal/identification-result`, it sends `userId`, and `notifyUser(userId, ...)` fans out to all active socket connections for that user. No `socketId` is ever passed in the upload request or stored in the BullMQ job payload.
- **Redis bound to vRack IP only** — `REDIS_BIND_IP` controls which network interface Redis binds to in production. Never expose Redis on the public interface.
- **Instance-2 is shelved when idle** — OVH bills shelved instances for storage only. `src/instance-lifecycle.js` handles automatic unshelve on job enqueue and shelve after idle timeout (`INSTANCE2_IDLE_MINUTES`).
- **S3 key convention** — `{uuid}{ext}` (e.g. `3f2a1b4c-1234-5678-abcd-ef0123456789.jpg`). There is no `photos/` prefix and no `userId` subdirectory — the UUID itself is the full key. All photo references in the DB use `s3_key`; there are no local file paths after V4.
- **`forcePathStyle: true`** required for both OVH Object Storage and local MinIO.
- **Test mocks** — use `jest.resetAllMocks()` (not `clearAllMocks`) to prevent stale `mockResolvedValueOnce` bleed between tests. When mocking `Promise.all`, comment the expected execution order of the mock queue.
- **Deprecated plan** — `docs/archive/v4-plan-infra-public-cloud-ovh.md` describes a NestJS + Nx architecture that was evaluated but never built. Ignore it; the real architecture uses Express + plain JavaScript.
