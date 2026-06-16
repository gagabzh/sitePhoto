# SitePhoto

A self-hosted photo gallery built with Express.js and PostgreSQL. SitePhoto supports albums, tags, GPS mapping, timeline viewing, access-controlled sharing, and async AI features (duplicate detection, people identification). Photos are stored in S3-compatible object storage.

The application runs on OVH Public Cloud with a cost-optimized two-instance architecture: one always-on instance for the web app and databases, and one on-demand instance for AI processing that automatically shelves when idle.

---

## Features

### Core Features
- **Account Management**: Profile editing, avatar upload/removal, session management, account self-deletion
- **User Management (admin)**: Create, edit, delete users; reset passwords
- **Photos**: Single and batch upload, tagging, edit, delete, EXIF date extraction, bulk operations
- **Albums**: Create, edit, delete; add/remove photos; grant/revoke per-album viewer access
- **Browsing**: Browse albums, filter by tag, access-denied handling for protected content

### Advanced Features
- **Map & GPS**: Add coordinates to photos, view locations, browse and filter photos on an interactive map
- **Timeline**: Chronological view with album/tag/date-range filters
- **Travel Pages**: Create travel records with GPX routes, link albums and photos, view routes on interactive maps or in journal view, share with viewers
- **Nextcloud Integration**: Link photos to Nextcloud originals, download from Nextcloud shares, import entire shared folders with real-time progress

### AI Features
- **Duplicate Detection**: Perceptual hash (dHash) scan to find near-identical images
- **People Identification**: Local vision model (Ollama with LLaVA) for face recognition
- **Manual Face Tagging**: Draw bounding boxes to tag people; tagged crops improve future AI recognition via few-shot learning

---

## Architecture

### Production Infrastructure (V4)

SitePhoto runs on **two OVH Public Cloud instances** connected via a private vRack network (10.0.0.0/24):

**Instance-1 (Always On — b2-7, 2 vCPU / 7 GB RAM)**
- Express.js web application (Node.js)
- PostgreSQL database
- Redis queue server
- Caddy reverse proxy with automatic HTTPS (Let's Encrypt)
- Internal API on port 3001 (vRack-only, for worker callbacks)

**Instance-2 (On-Demand — c3-8, 4 vCPU / 8 GB RAM)**
- BullMQ worker (Node.js) for job processing
- Ollama with LLaVA vision model for AI identification
- Automatically shelved when idle to save costs (~€10/month)

**Storage**
- OVH Object Storage (S3-compatible) in GRA region for photo storage
- Both instances access photos directly from S3 — no file transit over vRack

**Network Design**
- Public traffic: Browser → Caddy (HTTPS:80/443) → Express app (:3000)
- Private vRack: Instance-1 ↔ Instance-2
  - Redis: Instance-1:6379 (bound to vRack IP only)
  - Internal API: Instance-1:3001 (worker callbacks)
  - Worker SSH: Via Instance-1 as jump host

See [docs/architecture/architecture.md](docs/architecture/architecture.md) for detailed diagrams and design notes.

---

## Data Flow

```
User Upload → Express → S3 → Redis Queue → Worker → Ollama → Internal API → Socket.io → Browser
                          ↓
                     PostgreSQL (metadata)
```

1. User uploads photo via Express app
2. Photo stored in S3, metadata in PostgreSQL
3. Job queued in Redis (BullMQ)
4. Worker (Instance-2) polls queue, downloads from S3
5. Ollama processes image (LLaVA model)
6. Results POSTed to internal API on Instance-1
7. Socket.io notifies client browser in real-time

---

## Quick Start

### Local Development (Docker)

```bash
# Clone and setup
cp .env.example .env

# Start full stack (app, DB, Redis, MinIO S3, Caddy)
docker compose up -d --build

# Access the app at http://localhost
# MinIO console at http://localhost:9001
```

### Without Docker

```bash
# Install dependencies
npm install

# Start app (requires PostgreSQL running)
npm run dev     # nodemon, port 3000

# Run tests
npm test        # Jest test suite
npm run lint    # ESLint
```

A PostgreSQL instance must be running and `DATABASE_URL` must be set in `.env`.

---

## Production Deployment

### Prerequisites
- OVH Public Cloud project with vRack network
- Domain name pointing to your server
- Docker and Docker Compose v2

### Infrastructure Setup

The infrastructure is managed via Terraform in the [infra/](infra/) directory. See [infra/README.md](infra/README.md) for complete deployment instructions.

### Steps

1. **Deploy Infrastructure**: Use Terraform to create instances, network, and storage
2. **Configure Instance-1**: Set up environment variables and start the app stack
3. **Configure Instance-2**: Set up worker environment and start the worker
4. **Configure GitHub Actions**: Set up secrets for automated deployments
5. **Point DNS**: Configure your domain to Instance-1's public IP

See [infra/README.md](infra/README.md) for detailed step-by-step instructions.

### Automated Deployments

GitHub Actions automatically deploys:
- **Main app** (Instance-1): On push to `main` branch via `deploy-site.yml`
- **Worker** (Instance-2): On push to `main` branch via `deploy-worker.yml` (auto-unshelves instance)
- **Lifecycle management**: Nightly shelve/unshelve of instances via `lifecycle-instance1.yml`

---

## Configuration

### Environment Variables

Create `.env` from `.env.example` and configure:

| Variable | Description |
|---|---|
| `DOMAIN` | Domain name (e.g., `photos.example.com`). Use `localhost` for local dev. |
| `DB_PASSWORD` | PostgreSQL password — use a strong random value |
| `DATABASE_URL` | Full PostgreSQL connection string |
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

## Development Workflow

### Pull Requests and Branch Protection

The `main` branch is protected and requires the following GitHub Actions workflows to pass before merging:
- `deploy-site` (tests and lints the main application)
- `deploy-worker` (tests and lints the worker)
- `terraform-validate` (validates infrastructure Terraform configuration)

These workflows must complete successfully (exit code 0) for the merge button to become available. The "Require status checks to pass before merging" and "Require branches to be up to date before merging" options are enabled in GitHub branch protection settings. This protection applies to all PRs targeting `main`, including those from administrators.

### Running Tests
```bash
npm test              # Run all tests once
npm run test:watch   # Watch mode
npm run test:coverage # With coverage report
```

### Linting
```bash
npm run lint          # Check code style
```

### Database
```bash
# Manual migration
docker compose exec db psql -U sitephoto -d sitephoto

# Backup
docker compose exec db pg_dump -U sitephoto sitephoto > backup_$(date +%Y%m%d).sql
```

Photos are stored in S3 — back up via your object storage provider or use rclone.

---

## Cost Optimization

- **Instance-2 Auto-Shelving**: Worker instance shelves automatically when idle (configurable via `INSTANCE2_IDLE_MINUTES`)
- **Nightly Schedule**: Instance-1 shelves nightly (23:00-06:00 CET) via GitHub Actions
- **S3 Storage**: OVH Object Storage for cost-effective photo storage
- **Docker**: Lightweight container orchestration

---

## Project Structure

```
sitephoto/
├── src/                  # Application source code
│   ├── routes/           # Express routes
│   ├── models/           # Database models
│   ├── services/         # Business logic
│   ├── worker.js         # BullMQ worker entry point
│   └── server.js         # Express app entry point
├── worker/               # Worker-specific files
│   ├── Dockerfile        # Worker container
│   └── docker-compose.yml
├── infra/                # Terraform infrastructure
│   └── README.md         # Infrastructure deployment guide
├── docs/                 # Documentation
│   ├── architecture/     # Architecture diagrams
│   └── backlog/          # User stories and backlog
├── docker-compose.yml    # Local development
├── docker-compose.prod.yml # Production (Instance-1)
└── README.md             # This file
```

---

## Documentation

- **Feature Backlog**: [docs/backlog/STATUS.md](docs/backlog/STATUS.md)
- **Architecture**: [docs/architecture/architecture.md](docs/architecture/architecture.md)
- **User Stories**: [docs/user-stories.md](docs/user-stories.md)
- **Infrastructure**: [infra/README.md](infra/README.md)

---

## Technologies

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL 15
- **Queue**: Redis + BullMQ
- **Storage**: OVH Object Storage (S3-compatible)
- **AI**: Ollama with LLaVA model
- **Reverse Proxy**: Caddy (automatic HTTPS)
- **Containerization**: Docker + Docker Compose
- **Infrastructure**: Terraform (OVH Public Cloud)
- **CI/CD**: GitHub Actions
- **Real-time**: Socket.io

---

## License

Private project - All rights reserved

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
- **Manual face tagging** — draw bounding boxes on the photo detail page to name a person; the tagged crop is stored and injected as a few-shot example into future Ollama identification requests, progressively improving accuracy without retraining the model.

If Ollama is not running, duplicate detection and manual face tagging still work; Ollama-based identification returns a graceful error.

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
- Architecture diagrams and design notes: [docs/architecture/architecture.md](docs/architecture/architecture.md)
