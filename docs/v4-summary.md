# V4 — Implementation Summary
## OVH Public Cloud bi-instance architecture

> Updated: 2026-05-22

---

## Goal

Move photos off the local disk, make AI identification async, and split the app into two independent OVH Public Cloud instances connected over a private network.

---

## Architecture

```
Browser
  │  HTTP upload
  ▼
[Instance-1 — Express + PostgreSQL + Redis]
  │  S3 upload                   S3 download
  ├──────────────────────────────────────────► [OVH Object Storage]
  │  BullMQ job                                         │
  ▼                                                     │
[Redis — vRack private]                                 │
  │  consume job                                        │
  ▼                                                     ▼
[Instance-2 — Node.js Worker + Ollama] ◄──── S3 download
  │  POST /internal/identification-result
  ▼  (HTTP over vRack — authenticated)
[Instance-1]
  │
  ▼  WebSocket (socket.io)
Browser — "identification-complete" event
```

**Instance-1** — always on, serves the site, handles uploads, stores results in PostgreSQL.
**Instance-2** — on-demand or always on, consumes jobs from BullMQ, runs Ollama, sends results back.
**OVH Object Storage** — S3-compatible bucket, accessed directly by both instances (no file transit between them).
**Redis (on Instance-1)** — exposed only on the private vRack IP, never on the public internet.

---

## Key differences from V3

| Aspect | V3 | V4 |
|---|---|---|
| Photo storage | Local disk (`uploads/`) | OVH Object Storage (S3) |
| AI identification | Synchronous Ollama call on Instance-1 | Async BullMQ job on Instance-2 |
| Real-time feedback | None | WebSocket notification via socket.io |
| Infrastructure | Single VPS | Two OVH Public Cloud instances + vRack |
| Worker | None (in-process) | Separate Node.js app on Instance-2 |

---

## What's not changing

- Express.js framework (no migration to NestJS)
- Plain JavaScript (no TypeScript)
- PostgreSQL + existing schema (only `s3_key` column added to `photos`)
- Caddy reverse proxy
- All existing routes, views, auth, permissions

---

## Implementation phases

### Phase 0 — Repo structure
Add `worker/` subdirectory to the existing repo. No Nx, no monorepo tooling.

```
sitephoto/
  src/                    # existing — minimal changes
    storage.js            # NEW — S3 wrapper (CommonJS)
    queue/
      producer.js         # NEW — BullMQ queue producer
    routes/
      internal.js         # NEW — POST /internal/identification-result
    notifications.js      # NEW — socket.io gateway
    uploadHelpers.js      # MODIFIED — memoryStorage + S3 + enqueue
  worker/                 # NEW — separate Node.js app
    package.json
    Dockerfile
    src/
      worker.js           # BullMQ processor
      storage.js          # copy of src/storage.js
      ai.js               # Ollama client (adapted from src/ollama.js)
      instance1-api.js    # HTTP client → Instance-1 /internal
  docker-compose.yml      # MODIFIED — +Redis, +MinIO, +worker service
  docker-compose.prod.yml # NEW — prod (Redis only on Instance-1)
  .env.local.example      # NEW
```

### Phase 1 — OVH Public Cloud infrastructure
- Create a Public Cloud project, enable pay-as-you-go billing.
- Create a private vRack network (`10.0.0.0/24`, DHCP).
- Create an Object Storage bucket (`photo-storage`, region GRA, private).
- Generate S3 credentials (OVH user with ObjectStore operator role).
- Provision Instance-1 (`b2-7`: 2 vCores, 7 GB RAM) and Instance-2 (`c3-8` or `c3-16`).
- Configure Security Groups: Instance-1 exposes 80/443 publicly and 6379/3001 on vRack only. Instance-2 has no public ports.
- Generate `WORKER_API_SECRET` (64-char shared token).
- Install Docker on both instances.

### Phase 2 — Redis on Instance-1
Redis runs in Docker on Instance-1, bound to the private vRack IP only (`--bind 127.0.0.1 10.0.0.x`).

### Phase 3 — S3 storage module
`src/storage.js` — CommonJS wrapper around `@aws-sdk/client-s3`:
- `uploadPhoto(key, buffer, mimeType)` — used by Instance-1 on upload
- `downloadPhoto(key)` → `Buffer` — used by Instance-2 worker
- `deletePhoto(key)` — used on photo deletion

S3 key convention: `photos/{userId}/{uuid}/{filename}`

### Phase 4 — BullMQ producer + upload migration
- Add `bullmq` to `package.json`.
- `src/queue/producer.js` — `addIdentificationJob({ photoId, userId, photoS3Key, socketId })`, 3 retries with exponential backoff.
- `uploadHelpers.js`: switch multer from `diskStorage` to `memoryStorage`, upload buffer to S3, call `addIdentificationJob()`.
- `deletePhotos()`: replace `fs.promises.unlink` with `deletePhoto(s3Key)`.
- DB migration: add `s3_key TEXT` column to `photos`, run one-shot migration script to upload existing files from `uploads/` to S3.

### Phase 5 — socket.io notifications
- `src/notifications.js`: `initSocketIO(httpServer)` + `notifyUser(socketId, payload)`.
- Attach to the existing `http.createServer(app)` in `server.js`.
- Frontend: establish socket.io connection before upload, include `socket.id` in the upload request, listen for `identification-complete`.

### Phase 6 — Worker consumer (Instance-2)
`worker/src/worker.js`:
1. Download photo buffer from S3 via `downloadPhoto(photoS3Key)`.
2. Call Ollama (local on Instance-2) with the base64 image.
3. POST result to `http://10.0.0.x:3001/internal/identification-result` with `x-worker-secret` header.

`worker/src/ai.js` — copy of `src/ollama.js`, no changes needed.

> Ollama must be installed on Instance-2. The `llava` model (~4 GB) must be pulled before the worker starts.

### Phase 7 — Internal endpoint (Instance-1)
`src/routes/internal.js`:
- `requireWorkerSecret` middleware checks `x-worker-secret` header → 403 if missing or wrong.
- `POST /internal/identification-result`: calls `applyIdentificationResult(photoId, tags)` then `notifyUser(socketId, payload)`.
- Mounted in `app.js` under `/internal`, ideally on a separate port (3001) so it is never reachable from the public internet.

### Phase 8 — Local dev Docker Compose
`docker-compose.yml` updated to add:
- `redis` service (exposed on `localhost:6379` for debugging, password-protected)
- `minio` service (API on 9000, console on 9001)
- `minio-init` one-shot container (creates the `photo-storage` bucket)
- `worker` service (builds `./worker/Dockerfile`, shares Redis + MinIO env vars, points `OLLAMA_HOST` to `host-gateway`)

`docker-compose.prod.yml` — Redis only (Instance-1 production).

### Phase 9 — OVH deployment
No build tools. Each instance runs `docker build` + `docker compose up`. Separate `docker-compose.prod.yml` for production (no MinIO, no minio-init, Redis bound to vRack IP).

### Phase 10 — CI/CD (GitHub Actions)
- `deploy-site.yml` — triggers on changes to `src/**`, `public/**`, `Dockerfile`, `package*.json`.
- `deploy-worker.yml` — triggers on changes to `worker/**`.

### Phase 11 — Instance-2 lifecycle (optional)
`src/instance-lifecycle.js` — OVH Public Cloud API to start/stop Instance-2:
- Start when a BullMQ job enters the `waiting` state.
- Schedule stop after N minutes of queue inactivity (`drained` event + timer).
- Use **shelve** (not stop) to avoid paying for a stopped-but-not-terminated instance.

---

## Database migration

```sql
ALTER TABLE photos ADD COLUMN s3_key TEXT;
```

One-shot migration script uploads every existing `uploads/{filename}` to S3 under `photos/{user_id}/{uuid}/{filename}`, then updates `s3_key` in the DB. The `uploads/` volume can be removed from the Docker Compose after migration.

---

## Environment variables (new in V4)

**Instance-1 (site):**
```
REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY
WORKER_API_SECRET
INTERNAL_API_PORT=3001
```

**Instance-2 (worker):**
```
REDIS_HOST, REDIS_PORT, REDIS_PASSWORD    # same Redis on Instance-1 vRack IP
S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY
INSTANCE1_API_URL=http://10.0.0.x:3001
WORKER_API_SECRET                          # same shared secret
OLLAMA_HOST=127.0.0.1, OLLAMA_PORT=11434, OLLAMA_MODEL=llava
```

---

## Watchpoints

- `forcePathStyle: true` required for both OVH Object Storage and MinIO.
- `multer.memoryStorage()` keeps uploaded files in RAM — the existing 10 MB file size limit is sufficient.
- All references to `p.filename` in routes/views must be updated to `p.s3_key` after migration.
- Photos should be served via signed URLs or proxied through the Express app — never expose raw S3 credentials to the browser.
- Ollama + llava model (~4 GB) must be pre-pulled on Instance-2 before the first job runs.
- Use OVH **shelve** (not stop) for Instance-2 cost management — shelved instances are not billed.
- On WebSocket reconnect, the frontend should re-fetch photo status from the API to recover missed notifications.
