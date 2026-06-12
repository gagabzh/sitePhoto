# SitePhoto Worker

AI identification worker for SitePhoto — processes photo identification jobs from the main application.

## Architecture

The worker runs on **Instance-2** (c3-8 OVH instance) as a separate service from the main web application (Instance-1). Both instances communicate via a private vRack network (`10.0.0.0/24`).

```
┌─────────────────┐     ┌─────────────────┐
│  Instance-1      │     │  Instance-2      │
│  (App + DB)      │────▶│  (Worker + AI)   │
│                 │     │                 │
│  - Express.js   │     │  - BullMQ       │
│  - PostgreSQL   │     │    processor    │
│  - Redis        │     │  - Ollama       │
│  - Caddy        │     │    (llava)     │
└─────────────────┘     └─────────────────┘
                              ▲
                              │
                    ┌─────────┴─────────┐
                    │  Private vRack     │
                    │  10.0.0.0/24       │
                    └───────────────────┘
```

## Data Flow

1. **User uploads photo** → Main app (Instance-1)
2. **App queues job** → BullMQ via Redis (on vRack network)
3. **Worker picks up job** → Polls queue, downloads photo from S3
4. **AI identification** → Sends to Ollama (llava model) on Instance-2
5. **Results posted back** → HTTP POST to `/internal/identification-result` on Instance-1
6. **Client notified** → Via socket.io

## Setup

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- Access to S3-compatible storage (OVH Object Storage in production, MinIO locally)
- Redis instance on the vRack network
- Ollama running on Instance-2 with llava model pulled

### Environment Variables

Create a `.env.worker` file in the project root (or copy `worker/.env.example` to `.env.worker`):

```bash
# Redis connection (via vRack private network from Instance-1)
REDIS_HOST=10.0.0.X  # Instance-1's private IP
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# S3 configuration
S3_ENDPOINT=https://s3.gra.cloud.ovh.net
S3_REGION=gra
S3_ACCESS_KEY=your_access_key
S3_SECRET_KEY=your_secret_key
S3_BUCKET=your-bucket-name

# Internal API
INSTANCE1_API_URL=http://10.0.0.x:3001  # Instance-1 vRack IP
WORKER_API_SECRET=shared_secret_with_app

# Ollama (runs on Instance-2 host)
OLLAMA_HOST=127.0.0.1
OLLAMA_PORT=11434
OLLAMA_MODEL=llava
```

See `worker/.env.example` for the full list of environment variables.

### Local Development with MinIO

For local testing, use the main `docker-compose.yml` at the project root, which includes the worker service alongside all other services:

```bash
# From project root
docker compose up -d --build
```

The main compose file includes:
- Worker app (Node.js)
- Express.js main app
- PostgreSQL
- Redis
- MinIO (S3-compatible local storage)
- Caddy reverse proxy

For standalone worker testing, you can use the production `worker/docker-compose.yml` with local configuration.

### Production Deployment

The worker is deployed automatically by GitHub Actions (`deploy-worker.yml`):

- Triggered on pushes to main that modify `worker/**` files
- Can be manually triggered via `workflow_dispatch`
- Pulls latest code, builds Docker image, deploys to Instance-2

## Running

### Local Development

```bash
# Install dependencies
npm install

# Start worker
npm start
```

The worker will:
- Connect to Redis queue
- Poll for new identification jobs
- Process photos through Ollama
- Post results back to Instance-1

### Docker

For production deployment on Instance-2:

```bash
# From project root
docker compose -f worker/docker-compose.yml up -d --build

# View logs
docker compose -f worker/docker-compose.yml logs -f worker
```

## Configuration

### Queue Processor

The worker uses BullMQ to process jobs from the `identification` queue. Jobs contain:

```javascript
{
  photoId: 123,
  s3Key: 'uuid.jpg',
  userId: 456,
  socketId: 'socket-id-for-realtime-update'
}
```

### Ollama Integration

The worker sends photos to Ollama's llava model for identification. The model returns:

```json
{
  "tags": ["person", "beach", "sunset"],
  "description": "A person at the beach during sunset"
}
```

For manual face tagging (AI-1), the worker also injects known face crops as few-shot examples:

```
Known faces:
- Marie: [base64_encoded_crop]
- Jean: [base64_encoded_crop]

Identify people in this photo...
```

## Lifecycle Management

Instance-2 is **shelved when idle** to save costs (~€10/month). The lifecycle is managed by:

1. **Nightly shelve/unshelve** (GitHub Actions `lifecycle-instance1.yml`):
   - Shelved at 23:00 CET (22:00 UTC)
   - Unshelved at 06:00 CET (05:00 UTC)

2. **On-demand unshelving** (`deploy-worker.yml`):
   - Worker instance auto-unshelves when jobs are queued
   - Shelves again after inactivity period

## Monitoring

- **Queue length**: Check BullMQ dashboard or Redis CLI
- **Worker status**: `docker compose ps` on Instance-2
- **Logs**: `docker compose logs -f worker`
- **Ollama status**: `curl http://localhost:11434/api/tags`

## Troubleshooting

### Worker not picking up jobs

1. Check Redis connection: `docker compose exec worker redis-cli ping`
2. Verify queue exists: `docker compose exec worker redis-cli LRANGE bullmq:identification:wait 0 -1`
3. Check worker logs for errors

### Ollama not responding

1. Verify Ollama is running: `docker compose ps` (look for ollama service)
2. Check Ollama logs: `docker compose logs ollama`
3. Test model: `curl -X POST http://localhost:11434/api/generate -d '{"model":"llava", "prompt":"test"}'`

### S3 connection issues

1. Verify .env file has correct S3 credentials
2. Test S3 access: `aws s3 --endpoint-url=$S3_ENDPOINT ls s3://$S3_BUCKET`
3. Check CORS configuration on S3 bucket

## Security

- Worker communicates with Instance-1 via **shared secret** (`x-worker-secret` header)
- All internal API calls are authenticated
- S3 bucket is **private** — no direct URLs exposed to clients
- Redis is **not exposed publicly** — only on vRack private network

## Related Files

| File | Purpose |
|------|---------|
| `src/worker.js` | Main worker entry point |
| `Dockerfile` | Container image definition |
| `docker-compose.yml` | Local development stack |
| `.env.example` | Environment variable template |
