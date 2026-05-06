# sitephoto

A self-hosted photo gallery with albums, tags, timeline, GPS map, and Nextcloud integration.

---

## Requirements

- A Linux VPS (Ubuntu 22.04 or later recommended)
- Docker and Docker Compose v2
- A domain name with an A record pointing to the server
- Ports 80 and 443 open on the firewall

---

## Deployment

### 1 — Point your domain to the server

In your DNS zone, add:

```
A   @    <VPS_IP>
A   www  <VPS_IP>   (optional)
```

Wait for propagation (a few minutes to 1 hour) before starting the app, otherwise Let's Encrypt certificate issuance will fail.

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

| Variable | Description |
|---|---|
| `DOMAIN` | Your domain name (e.g. `photos.example.com`) |
| `DB_PASSWORD` | PostgreSQL password — use a strong random value |
| `SESSION_SECRET` | Secret used to sign sessions — use a strong random value |
| `SEED_NAME` | Name of the first admin account |
| `SEED_EMAIL` | Email of the first admin account |
| `SEED_PASS` | Password of the first admin account |

Generate strong secrets with:

```bash
openssl rand -base64 32
```

### 5 — Start the application

```bash
docker compose up -d --build
```

Caddy automatically obtains a TLS certificate from Let's Encrypt on the first request. The site will be available at `https://<DOMAIN>`.

Check that everything started correctly:

```bash
docker compose logs -f
```

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

### Database

```bash
docker compose exec db pg_dump -U sitephoto sitephoto > backup_$(date +%Y%m%d).sql
```

### Uploaded photos

The `uploads/` directory on the host contains all photo files. Copy it to a safe location:

```bash
tar -czf uploads_$(date +%Y%m%d).tar.gz uploads/
```

---

## Development

```bash
npm install
npm run dev     # starts the server with nodemon on port 3000
npm test        # runs the test suite
```

A local PostgreSQL instance must be running and accessible via the `DATABASE_URL` environment variable.
