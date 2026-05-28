# sitephoto

A self-hosted photo gallery built with Express.js and PostgreSQL. It supports albums, tags, GPS map, timeline, access-controlled sharing, and async AI features (duplicate detection, people identification). Photos are stored in S3-compatible object storage. The app runs on two OVH Public Cloud instances connected over a private vRack: one always-on instance for the web app, one shelved-when-idle instance for the AI worker.

---

## Features

**Account** — profile editing, avatar upload/removal, session management (list and revoke), account self-deletion with typed confirmation, role-aware identity card (admin / editor / viewer)

**User management (admin)** — create, edit, delete users; reset passwords

**Photos** — single and batch upload, tagging, edit, delete, EXIF date extraction, select-all for bulk operations

**Albums** — create, edit, delete albums; add/remove photos; grant/revoke per-album viewer access

**Browsing** — browse albums, filter by tag, access-denied handling for protected content

**Map & GPS** — add coordinates to photos, view location, browse and filter photos on a map

**Timeline** — chronological view with album/tag/date-range filters

**Infrastructure** — S3-compatible object storage, async BullMQ queue (upload returns immediately), real-time WebSocket notifications (socket.io), on-demand worker lifecycle (unshelve on job / shelve after idle), PostgreSQL session persistence, nightly instance scheduling via GitHub Actions

---

## Architecture

Instance-1 (always on) runs the Express app, PostgreSQL, Redis, and Caddy. Instance-2 (shelved when idle) runs the BullMQ worker and Ollama. Both instances share an OVH Object Storage bucket over the public internet; internal traffic (Redis, worker callbacks) stays on the private vRack (`10.0.0.0/24`). The worker POSTs results back to Instance-1's internal API, which then pushes a WebSocket notification to the browser.

See [docs/architecture/architecture-v4.md](docs/architecture/architecture-v4.md) for diagrams and full design notes.

---

## Development setup

### Full local stack (recommended)

```bash
cp .env.example .env
docker compose up -d --build
# App at http://localhost, MinIO at http://localhost:9001
```

### Without Docker

```bash
npm install
npm run dev     # nodemon, port 3000
npm test        # Jest test suite
npm run lint    # ESLint
```

A PostgreSQL instance must be running and `DATABASE_URL` must be set in `.env`.

---

## Requirements (production)

- Linux VPS — Ubuntu 22.04 or later
- Docker and Docker Compose v2
- Domain name with an A record pointing to the server
- Ports 80 and 443 open

---

## Deployment

### 1 — Point your domain to the server

```
A   @    <VPS_IP>
A   www  <VPS_IP>   (optional)
```

Wait for DNS propagation before starting — Let's Encrypt certificate issuance will fail if the domain does not resolve yet.

### 2 — Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### 3 — Clone the repository

```bash
git clone https://github.com/gagabzh/sitePhoto.git
cd sitePhoto
```

### 4 — Configure environment variables

```bash
cp .env.example .env
nano .env
```

See the environment variables table below. Generate secrets with:

```bash
openssl rand -base64 32
```

### 5 — Start the application

```bash
docker compose up -d --build
```

Caddy obtains a TLS certificate automatically on the first request. Check logs with:

```bash
docker compose logs -f
```

---

## Environment variables

| Variable | Description |
|---|---|
| `DOMAIN` | Domain name (e.g. `photos.example.com`). Use `localhost` for local dev. |
| `DB_PASSWORD` | PostgreSQL password — use a strong random value |
| `DATABASE_URL` | Full PostgreSQL connection string — replace `<DB_PASSWORD>` with the value above |
| `SESSION_SECRET` | Secret used to sign sessions — use a strong random value |
| `SEED_NAME` | Display name for the first admin account |
| `SEED_EMAIL` | Email for the first admin account |
| `SEED_PASS` | Password for the first admin account |
| `OLLAMA_HOST` | Host where Ollama is reachable (default: `host-gateway` for Docker) |
| `OLLAMA_PORT` | Ollama port (default: `11434`) |
| `OLLAMA_MODEL` | Vision model name (e.g. `llava` or `moondream`) |
| `REDIS_BIND_IP` | vRack private IP of Instance-1 — Redis binds to loopback + this IP |
| `REDIS_HOST` | Redis host used by the worker (Instance-2); app uses Docker service name |
| `REDIS_PORT` | Redis port (default: `6379`) |
| `REDIS_PASSWORD` | Redis password |
| `WORKER_API_SECRET` | Shared secret between Instance-1 and the worker — generate with `openssl rand -hex 32` |
| `INTERNAL_API_PORT` | Port for the internal API that the worker posts results to (Instance-1 only) |
| `S3_ENDPOINT` | S3-compatible endpoint URL (e.g. `https://s3.gra.cloud.ovh.net`) |
| `S3_REGION` | S3 region (e.g. `gra`) |
| `S3_BUCKET` | S3 bucket name |
| `S3_ACCESS_KEY` | S3 access key |
| `S3_SECRET_KEY` | S3 secret key |
| `OVH_APP_KEY` | OVH API application key (for Instance-2 lifecycle management) |
| `OVH_APP_SECRET` | OVH API application secret |
| `OVH_CONSUMER_KEY` | OVH API consumer key |
| `OVH_PROJECT_ID` | OVH Public Cloud project ID |
| `INSTANCE2_ID` | UUID of Instance-2 (AI worker) |
| `INSTANCE2_IDLE_MINUTES` | Minutes of inactivity before Instance-2 is shelved (default: `10`) |
| `INSTANCE1_ID` | UUID of Instance-1 (used by the nightly shelve/unshelve GitHub Action) |

---

## Updating

```bash
git pull
docker compose up -d --build
```

Database migrations run automatically on startup — no manual steps needed.

---

## Useful commands

```bash
# View logs
docker compose logs app
docker compose logs caddy

# Restart the app
docker compose restart app

# Open a database shell
docker compose exec db psql -U sitephoto -d sitephoto

# Stop everything
docker compose down

# Stop and delete all data (irreversible)
docker compose down -v
```

---

## Backup

```bash
# Database
docker compose exec db pg_dump -U sitephoto sitephoto > backup_$(date +%Y%m%d).sql

# Photos (stored in S3 — back up via your object storage provider or use rclone)
```

---

## AI features (optional)

Two AI features are available under **Admin -> AI Tools**:

- **Duplicate detection** — perceptual hash (dHash) scan over all photos; groups near-identical images for review. No extra setup required.
- **People identification** — sends photos to a local vision model (Ollama) and matches faces against existing people tags. Requires Ollama running on the host.

If Ollama is not running, duplicate detection still works and people identification returns a graceful error.

### Installing Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llava       # ~4 GB, requires GPU
# or: ollama pull moondream  (~1.7 GB, CPU-friendly)
```

Ollama must listen on all interfaces so Docker can reach it — set `OLLAMA_HOST=0.0.0.0` in the Ollama systemd override or run it manually with `OLLAMA_HOST=0.0.0.0 ollama serve`.

---

## Documentation

- Feature backlog and status: [docs/backlog/STATUS.md](docs/backlog/STATUS.md)
- Architecture diagrams and design notes: [docs/architecture/architecture-v4.md](docs/architecture/architecture-v4.md)
