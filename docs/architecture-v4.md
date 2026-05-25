# Architecture — V4

> Updated: 2026-05-25

---

## Infrastructure

```mermaid
graph TB
    Browser([Browser])
    GHA([GitHub Actions])

    subgraph OVH["OVH Public Cloud — GRA"]
        subgraph I1["Instance-1 — b3-8 · 4 vCPU / 8 GB · always on"]
            Caddy["Caddy\n:80 / :443"]
            App["Node.js / Express\n:3000"]
            PG[("PostgreSQL\n:5432")]
            Redis[("Redis\n:6379 — vRack only")]
            IntAPI["Internal API\n:3001 — vRack only"]
        end

        vRack(("vRack\n10.0.0.0/24"))

        subgraph I2["Instance-2 — c3-8 · 4 vCPU / 8 GB · shelved when idle"]
            Worker["Node.js Worker\nBullMQ consumer"]
            Ollama["Ollama\nLLaVA model"]
        end

        S3[("OVH Object Storage\nS3-compatible · GRA")]
    end

    Browser -- "HTTPS 80/443" --> Caddy
    Caddy -- "proxy" --> App
    App --- PG
    App -- "bind vRack" --- Redis
    App --- IntAPI

    App -- "vRack" --- vRack
    vRack -- "vRack" --- I2

    App -- "upload / delete" --> S3
    Worker -- "download" --> S3

    Worker -- "consume jobs" --> Redis
    Worker -- "POST /internal/identification-result" --> IntAPI

    GHA -- "SSH :22" --> Caddy
    GHA -- "SSH via jump host" --> Worker
```

---

## Photo upload & AI identification flow

```mermaid
sequenceDiagram
    actor User as Browser
    participant Caddy
    participant App as App (Instance-1)
    participant Redis
    participant S3 as OVH Object Storage
    participant Worker as Worker (Instance-2)
    participant Ollama

    User->>App: POST /photos (multipart)
    App->>S3: upload buffer → photos/{userId}/{uuid}/{filename}
    App->>Redis: BullMQ — addIdentificationJob({ photoId, s3Key, socketId })
    App-->>User: 201 Created (photo saved, identification pending)

    Worker->>Redis: consume job
    Worker->>S3: download photo buffer
    Worker->>Ollama: identify (base64 image)
    Ollama-->>Worker: tags / description
    Worker->>App: POST :3001/internal/identification-result (x-worker-secret)
    App->>App: update DB — tags, description
    App-->>User: WebSocket "identification-complete" event
```

---

## CI/CD

```mermaid
graph LR
    Push([git push → main])

    Push -- "src/** / public/**\nDockerfile / package*.json" --> WF1

    Push -- "worker/**" --> WF2

    subgraph WF1["deploy-site.yml"]
        S1["SSH → Instance-1\ngit reset --hard\ndocker compose build + up"]
    end

    subgraph WF2["deploy-worker.yml"]
        S2["Check Instance-2 status\n(OVH API)"]
        S3["Unshelve + wait ACTIVE\n+ 60 s sshd boot\n(skipped if already ACTIVE)"]
        S4["SSH via Instance-1 jump\ngit reset --hard\ndocker compose build + up"]
        S5["Shelve Instance-2\n(OVH API)"]
        S2 --> S3 --> S4 --> S5
    end
```

---

## Network rules (ufw)

| Instance | Port | Source | Purpose |
|----------|------|--------|---------|
| Instance-1 | 22 | Anywhere | SSH (GitHub Actions / admin) |
| Instance-1 | 80 / 443 | Anywhere | HTTP / HTTPS (Caddy) |
| Instance-1 | 6379 | 10.0.0.0/24 | Redis (Worker consumer) |
| Instance-1 | 3001 | 10.0.0.0/24 | Internal API (Worker callback) |
| Instance-2 | 22 | 10.0.0.0/24 | SSH via Instance-1 jump host only |

---

## Key design decisions

| Decision | Reason |
|----------|--------|
| Instance-2 shelved when idle | OVH bills shelved instances for storage only (~€0.01/GB/month) vs full flavor price when stopped |
| Redis bound to vRack IP only | Never reachable from the public internet — port mapping `${REDIS_BIND_IP}:6379:6379` on the host |
| Internal API on port 3001 | Separated from the public app port (3000) so Caddy never proxies it |
| `git reset --hard` in deploy | Avoids divergent branch failures when Instance-1 has local commits from manual setup |
| SSH jump host via Instance-1 | Instance-2 has no inbound public SSH — GitHub Actions uses `proxy_host` |
| OVH Object Storage (S3) | Both instances access photos directly — no file transit between them over the vRack |
