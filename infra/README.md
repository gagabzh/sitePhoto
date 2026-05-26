# V4 Infrastructure — OVH Public Cloud deployment

Two instances on OVH Public Cloud connected over a private vRack network.

```
Browser
  │ HTTPS
  ▼
[Instance-1 — Express + PostgreSQL + Redis]  ──S3──►  [OVH Object Storage]
  │ BullMQ job (vRack)                                        │ S3
  ▼                                                           ▼
[Redis — vRack 10.0.0.x:6379]                     [Instance-2 — Worker + Ollama]
  │ consume job                                      POST /internal (vRack)
  └──────────────────────────────────────────────────────────►│
                                                              ▼
                                                    [Instance-1 → WebSocket → Browser]
```

---

## State management

Terraform state is stored locally in `terraform.tfstate` (gitignored).  
`.terraform.lock.hcl` (provider version lock) **is** committed and should stay in git.

For a solo project, local state is fine — just keep a manual backup of `terraform.tfstate`.  
To migrate to a remote OVH S3 backend (recommended for teams), see the comments in `backend.tf`.

---

## Prerequisites

Install on your local machine:

```bash
# Terraform >= 1.5
# https://developer.hashicorp.com/terraform/install
terraform -version

# OpenStack CLI (optional — useful to verify image names)
pip install python-openstackclient
```

---

## Step 1 — OVH API credentials

Go to **https://www.ovh.com/auth/api/createToken** and create a token with:

- Application name: `sitephoto-terraform`
- Rights — add **all five** rules exactly as below:

| Method | Path |
|---|---|
| GET | `/cloud/project` |
| GET | `/cloud/project/*` |
| POST | `/cloud/project/*` |
| PUT | `/cloud/project/*` |
| DELETE | `/cloud/project/*` |

> `GET /cloud/project` (without wildcard) is required in addition to the wildcard rules — missing it causes a 403 on the first Terraform call.

Save the three values: **Application Key**, **Application Secret**, **Consumer Key**.

Optionally restrict the token to your current IP (recommended if you always run Terraform from the same machine):

```bash
curl -s ifconfig.me   # your current public IP
```

---

## Step 2 — Get your Public Cloud project ID

In the OVH Manager, open your Public Cloud project.  
The project ID is the alphanumeric string in the URL:

```
https://www.ovh.com/manager/#/public-cloud/pci/projects/<PROJECT_ID>/
```

---

## Step 3 — Create an OpenStack user

In the OVH Manager → Public Cloud → **Users & Roles**:

1. Create a new user (or reuse an existing one).
2. Assign roles: **ObjectStore operator** + **Compute operator**.
3. Click the user → **Generate password** → save it.
4. Note the **username** (e.g. `user-xxxxxxxx`).

> This user is used by Terraform's OpenStack provider and is different from the dedicated S3 user Terraform will create for the app itself.

---

## Step 4 — Generate an SSH deploy key

```bash
ssh-keygen -t ed25519 -C "sitephoto-deploy" -f ~/.ssh/sitephoto_deploy
```

Keep `~/.ssh/sitephoto_deploy` (private key) — you'll need it for GitHub Actions secrets.  
You'll paste the content of `~/.ssh/sitephoto_deploy.pub` into `terraform.tfvars`.

---

## Step 5 — Fill in terraform.tfvars

```bash
cd infra/
cp terraform.tfvars.example terraform.tfvars
```

Open `terraform.tfvars` and fill in every value. Refer to the comments in the file.

**Regions** — `compute_region` and `storage_region` are different:

| Variable | Purpose | Example value |
|---|---|---|
| `compute_region` | Instances, images, security groups | `GRA9` or `GRA11` |
| `storage_region` | Object Storage (Swift/S3) | `GRA` |

To find which compute region is available in your project:  
**OVH Manager → Public Cloud → Instances → Create an instance → Region dropdown**  
Use whatever region is shown there (e.g. `GRA9`). Leave `storage_region = "GRA"`.

**Ubuntu image name** — check the exact name OVH exposes in your compute region:

```bash
# Download openrc.sh from OVH Manager → Users & Roles → your user → Download RC file
source ~/openrc.sh
openstack image list --os-region-name GRA9 | grep -i ubuntu
```

> Replace `GRA9` with your actual compute region.  
> The openrc.sh sets `OS_REGION_NAME=GRA` (storage region) — override it with `--os-region-name` for compute commands.

If the name is `"Ubuntu 24.04 LTS"` instead of `"Ubuntu 24.04"`, update `ubuntu_image_name` in `terraform.tfvars`.

---

## Step 6 — Terraform init / plan / apply

> **Prerequisite**: PR #44 (V4 app code — S3, BullMQ, socket.io) must be merged into `main` before running `terraform apply`. Cloud-init clones the `main` branch on first boot — if #44 is not merged, the instances will clone an app without S3/queue support and `docker compose up` will fail.

```bash
cd infra/
terraform init
terraform plan     # review what will be created
terraform apply    # type "yes" to confirm
```

Terraform will create:
- Private vRack network `photo-private-network` (10.0.0.0/24)
- Security groups for both instances
- Object Storage container `photo-storage`
- Dedicated S3 user + access/secret keys
- Instance-1 (`b3-8`, Ubuntu 24.04, public IP + vRack)
- Instance-2 (`c3-8`, Ubuntu 24.04, public IP for outbound + vRack, no public inbound)
- SSH keypair

> Cloud-init runs on first boot: installs Docker, clones the repo. Allow ~2 minutes after `apply` before SSHing in.

---

## Step 7 — Note down the Terraform outputs

Run these from your **local machine** in `infra/` and keep the values handy for Steps 8 and 9:

```bash
terraform output instance1_public_ip    # SSH target for Instance-1
terraform output instance1_private_ip   # → REDIS_BIND_IP, REDIS_HOST
terraform output instance2_private_ip   # SSH target for Instance-2 (via jump)
terraform output s3_endpoint            # → S3_ENDPOINT
terraform output s3_region              # → S3_REGION
terraform output s3_bucket              # → S3_BUCKET
terraform output s3_access_key          # → S3_ACCESS_KEY
terraform output -raw s3_secret_key     # → S3_SECRET_KEY
```

---

## Step 8 — Configure Instance-1

SSH in:

```bash
ssh -i ~/.ssh/sitephoto_deploy ubuntu@$(terraform output -raw instance1_public_ip)
```

Create the env file from the template:

```bash
cd ~/sitephoto
cp .env.example .env.prod
nano .env.prod
```

`.env.example` contains all required variables with placeholder values. Replace each one:

**Generate the secrets first (run on Instance-1):**

```bash
openssl rand -hex 32   # run twice — one value for SESSION_SECRET, one for WORKER_API_SECRET
openssl rand -hex 16   # for DB_PASSWORD and REDIS_PASSWORD
```

**Fill in every placeholder:**

| Variable | Where to get the value |
|---|---|
| `DOMAIN` | Your domain name (e.g. `photos.example.com`) |
| `DB_PASSWORD` | Generated above |
| `DATABASE_URL` | `postgresql://sitephoto:<DB_PASSWORD>@db:5432/sitephoto` — same password as above |
| `SESSION_SECRET` | Generated above (`openssl rand -hex 32`) |
| `SEED_EMAIL` / `SEED_PASS` | Admin account credentials |
| `REDIS_BIND_IP` | `terraform output instance1_private_ip` |
| `REDIS_HOST` | Same as `REDIS_BIND_IP` |
| `REDIS_PASSWORD` | Generated above |
| `WORKER_API_SECRET` | Generated above (`openssl rand -hex 32`) — **save this, needed on Instance-2** |
| `S3_ENDPOINT` | `terraform output s3_endpoint` |
| `S3_REGION` | `terraform output s3_region` |
| `S3_BUCKET` | `terraform output s3_bucket` |
| `S3_ACCESS_KEY` | `terraform output s3_access_key` |
| `S3_SECRET_KEY` | `terraform output -raw s3_secret_key` |

Run the DB migration and start the stack:

```bash
# Start the full stack (first run also creates the DB schema via init-db.sql)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Run the V9 migration (adds s3_key column)
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  psql -U sitephoto -d sitephoto -f /dev/stdin < migrations/v9.sql

# Verify everything is up
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs app --tail=20
```

---

## Step 9 — Configure Instance-2

SSH in via Instance-1 as jump host (Instance-2 has no public inbound SSH):

```bash
ssh -i ~/.ssh/sitephoto_deploy \
    -J ubuntu@$(terraform output -raw instance1_public_ip) \
    ubuntu@$(terraform output -raw instance2_private_ip)
```

Create the env file — `.env.worker` is what `worker/docker-compose.yml` reads:

```bash
cd ~/sitephoto
cp .env.example .env.worker
nano .env.worker
```

`.env.worker` only needs the V4 variables. Fill in:

| Variable | Where to get the value |
|---|---|
| `REDIS_HOST` | `terraform output instance1_private_ip` |
| `REDIS_PORT` | `6379` |
| `REDIS_PASSWORD` | Same value as Instance-1 `REDIS_PASSWORD` |
| `WORKER_API_SECRET` | Same value as Instance-1 `WORKER_API_SECRET` |
| `INSTANCE1_API_URL` | `http://<instance1_private_ip>:3001` — get IP from `terraform output instance1_private_ip` |
| `S3_ENDPOINT` | `terraform output s3_endpoint` |
| `S3_REGION` | `terraform output s3_region` |
| `S3_BUCKET` | `terraform output s3_bucket` |
| `S3_ACCESS_KEY` | `terraform output s3_access_key` |
| `S3_SECRET_KEY` | `terraform output -raw s3_secret_key` |

> The other variables in `.env.example` (`DOMAIN`, `DB_PASSWORD`, `OLLAMA_*`, etc.) are ignored by the worker — leave them at their placeholder values.

Pull the Ollama model (this downloads ~4 GB — run in a screen/tmux session):

```bash
screen -S ollama
ollama pull llava
# Ctrl+A D to detach
```

Start the worker:

```bash
docker compose -f worker/docker-compose.yml up -d

# Verify
docker compose -f worker/docker-compose.yml ps
docker compose -f worker/docker-compose.yml logs --tail=20
```

---

## Step 10 — Verify vRack connectivity

From Instance-1, confirm Redis is reachable by Instance-2:

```bash
# On Instance-1: check Redis is bound to vRack IP
REDIS_PASS=$(grep ^REDIS_PASSWORD .env.prod | cut -d= -f2)
docker compose -f docker-compose.prod.yml --env-file .env.prod exec redis \
  redis-cli -a "$REDIS_PASS" ping
# Should return PONG

# On Instance-2: test Redis connection (replace 10.0.0.x with Instance-1 vRack IP)
redis-cli -h 10.0.0.x -p 6379 -a <REDIS_PASSWORD> ping
# Should return PONG
```

---

## Step 11 — Add GitHub Actions secrets

In the GitHub repository → **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `INSTANCE1_HOST` | `terraform output -raw instance1_public_ip` |
| `INSTANCE1_USER` | `ubuntu` |
| `INSTANCE1_SSH_KEY` | Content of `~/.ssh/sitephoto_deploy` (private key) |
| `INSTANCE2_HOST` | `terraform output -raw instance2_private_ip` (vRack IP) |
| `INSTANCE2_USER` | `ubuntu` |
| `INSTANCE2_SSH_KEY` | Same private key as Instance-1 (or a separate one) |

> `INSTANCE2_HOST` must be the **vRack private IP** (10.0.0.x), not the public IP.  
> The deploy-worker workflow SSHes to it via Instance-1 as a jump host.

---

## Step 12 — DNS

Point your domain to Instance-1's public IP:

```
A  photos.example.com  →  <instance1_public_ip>
```

Caddy will automatically obtain a Let's Encrypt certificate when DNS resolves.

---

## Step 13 — End-to-end smoke test

1. Open the site, log in as admin.
2. Upload a photo.
3. Verify the upload responds immediately (< 500 ms).
4. Check the photo appears in the OVH Object Storage bucket (OVH Manager → Storage).
5. Check Instance-2 logs: `docker compose -f worker/docker-compose.yml logs -f`
6. Wait for the AI identification to complete — tags should appear without page reload.

---

## Day-2 operations

### Restart the site after a code push

```bash
# GitHub Actions handles this automatically on push to main.
# Manual restart:
ssh ubuntu@<instance1_public_ip> \
  'cd ~/sitephoto && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps app caddy'
```

### Restart the worker after a code push

```bash
# GitHub Actions handles this automatically on push to main (via jump host).
# Manual restart:
ssh -J ubuntu@<instance1_public_ip> ubuntu@<instance2_private_ip> \
  'cd ~/sitephoto && docker compose -f worker/docker-compose.yml up -d'
```

### Apply a new DB migration

```bash
ssh ubuntu@<instance1_public_ip>
cd ~/sitephoto
docker compose -f docker-compose.prod.yml exec db \
  psql -U sitephoto -d sitephoto -f /dev/stdin < migrations/vN.sql
```

### Check queue status

```bash
# From Instance-1
docker compose -f docker-compose.prod.yml exec app \
  node -e "
    const { Queue } = require('bullmq');
    const q = new Queue('identification', { connection: { host: process.env.REDIS_HOST, port: 6379, password: process.env.REDIS_PASSWORD }});
    q.getJobCounts().then(console.log).then(() => process.exit());
  "
```

### Shelve Instance-2 when not needed (saves cost)

OVH bills stopped instances. Use **shelve** instead of stop to avoid charges:

```
OVH Manager → Public Cloud → Instances → Instance-2 → Shelve
```

Or via OVH API — the optional Phase 11 in `docs/v4-summary.md` covers automatic lifecycle management.

---

## Tear down

```bash
cd infra/
terraform destroy
```

> This deletes instances, the private network, the Object Storage container, and the S3 user.  
> **The photos in the bucket are deleted.** Back them up first if needed.

---

## Troubleshooting

| Problem | Check |
|---|---|
| SSH timeout to Instance-1 | ufw allows port 22 — check `sudo ufw status` |
| SSH timeout to Instance-2 | Use jump host; ufw on Instance-2 only allows port 22 from 10.0.0.0/24 |
| Instance-2 accessible via public SSH | ufw not applied — run the ufw rules manually (see Step 9) |
| 502 Bad Gateway | App container is restarting — check `docker compose logs app` |
| `Database connection failed: password authentication failed` | `DATABASE_URL` password doesn't match `DB_PASSWORD`; check both values in `.env.prod` are identical |
| `Database connection failed:` (empty error) | `DATABASE_URL` missing from `.env.prod` — add `postgresql://sitephoto:<DB_PASSWORD>@db:5432/sitephoto` |
| Redis `WRONGPASS` from shell | `$REDIS_PASSWORD` is not in shell env — use `REDIS_PASS=$(grep ^REDIS_PASSWORD .env.prod \| cut -d= -f2)` |
| Redis `bind: Address not available` | vRack IP can't be bound inside container — Redis must bind to `0.0.0.0` (already fixed in `docker-compose.prod.yml`) |
| Docker `permission denied` on socket | Re-login after first setup — `usermod -aG docker ubuntu` requires a new session |
| Compose vars empty (`DB_PASSWORD`, `REDIS_BIND_IP`) | Always pass `--env-file .env.prod` to `docker compose` commands |
| OVH API 403 on `terraform apply` | Token missing `GET /cloud/project` (without wildcard) — regenerate with all 5 rules |
| OpenStack endpoint not found | `compute_region` set to `GRA` (storage region) — use `GRA9` or `GRA11` |
| Security group quota exceeded | New projects have 0 quota — ufw is used instead (no quota needed) |
| cloud-init did not run | Instances existed before user_data was set — run setup manually or `terraform destroy -target` and recreate |
| apt lock error in cloud-init | `unattended-upgrades` holds the lock on first boot — already fixed in `instances.tf` |
| Ollama `command not found` | cloud-init failed before Ollama step — run `curl -fsSL https://ollama.com/install.sh \| sudo sh` manually |
| S3 upload fails | Verify `S3_ENDPOINT` region matches bucket region; `forcePathStyle: true` is set in `src/storage.js` |
| Worker not picking up jobs | Verify `REDIS_HOST` in `.env.worker` matches Instance-1 vRack IP |
| Caddy not issuing certificate | DNS A record must resolve to Instance-1 public IP before first request |
| Image name not found in Terraform | Run `openstack image list --os-region-name GRA9 \| grep -i ubuntu` to get exact name |
