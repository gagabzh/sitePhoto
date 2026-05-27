# ── Instance IPs ──────────────────────────────────────────────────────────────

output "instance1_public_ip" {
  description = "Instance-1 public IP → INSTANCE1_HOST GitHub secret"
  value       = openstack_compute_instance_v2.instance1.network[0].fixed_ip_v4
}

output "instance1_private_ip" {
  description = "Instance-1 vRack IP → REDIS_HOST / REDIS_BIND_IP env var"
  value       = openstack_compute_instance_v2.instance1.network[1].fixed_ip_v4
}

output "instance1_id" {
  description = "Instance-1 UUID → INSTANCE1_ID env var (INF-3 nightly lifecycle job)"
  value       = openstack_compute_instance_v2.instance1.id
}

output "instance2_id" {
  description = "Instance-2 UUID → INSTANCE2_ID env var (Phase 11 lifecycle management)"
  value       = openstack_compute_instance_v2.instance2.id
}

output "instance2_public_ip" {
  description = "Instance-2 public IP (outbound only — no inbound security group rules)"
  value       = openstack_compute_instance_v2.instance2.network[0].fixed_ip_v4
}

output "instance2_private_ip" {
  description = "Instance-2 vRack IP → INSTANCE2_HOST GitHub secret (SSH via jump host)"
  value       = openstack_compute_instance_v2.instance2.network[1].fixed_ip_v4
}

# ── S3 / Object Storage ───────────────────────────────────────────────────────

output "s3_endpoint" {
  description = "S3-compatible endpoint → S3_ENDPOINT env var"
  value       = "https://s3.${lower(var.storage_region)}.cloud.ovh.net"
}

output "s3_region" {
  description = "S3 region → S3_REGION env var"
  value       = lower(var.storage_region)
}

output "s3_bucket" {
  description = "S3 bucket name → S3_BUCKET env var"
  value       = var.s3_bucket_name
}

output "s3_access_key" {
  description = "S3 access key → S3_ACCESS_KEY env var"
  value       = ovh_cloud_project_user_s3_credential.s3.access_key_id
}

output "s3_secret_key" {
  description = "S3 secret key → S3_SECRET_KEY env var"
  value       = ovh_cloud_project_user_s3_credential.s3.secret_access_key
  sensitive   = true
}

# ── .env.prod template ────────────────────────────────────────────────────────
# Copy this block into ~/sitephoto/.env.prod on Instance-1, then fill in the
# blanks (DB_PASSWORD, SESSION_SECRET, WORKER_API_SECRET, REDIS_PASSWORD, DOMAIN).

output "env_prod_instance1" {
  description = ".env.prod template for Instance-1 — fill in secrets before use"
  sensitive   = true
  value       = <<-ENV
    DOMAIN=<your-domain.example.com>
    DB_PASSWORD=<strong-password>
    SESSION_SECRET=<64-char-random-string>
    SEED_EMAIL=<admin@example.com>
    SEED_PASS=<strong-password>
    SEED_NAME=Admin

    REDIS_BIND_IP=${openstack_compute_instance_v2.instance1.network[1].fixed_ip_v4}
    REDIS_HOST=${openstack_compute_instance_v2.instance1.network[1].fixed_ip_v4}
    REDIS_PORT=6379
    REDIS_PASSWORD=<strong-password>

    WORKER_API_SECRET=<64-char-random-string>
    INTERNAL_API_PORT=3001

    S3_ENDPOINT=https://s3.${lower(var.storage_region)}.cloud.ovh.net
    S3_REGION=${lower(var.storage_region)}
    S3_BUCKET=${var.s3_bucket_name}
    S3_ACCESS_KEY=${ovh_cloud_project_user_s3_credential.s3.access_key_id}
    S3_SECRET_KEY=${ovh_cloud_project_user_s3_credential.s3.secret_access_key}

    # Phase 11 — Instance-2 lifecycle (optional, leave blank to disable)
    OVH_APP_KEY=<same-key-as-terraform>
    OVH_APP_SECRET=<same-secret-as-terraform>
    OVH_CONSUMER_KEY=<same-consumer-key-as-terraform>
    OVH_PROJECT_ID=${var.ovh_project_id}
    INSTANCE2_ID=${openstack_compute_instance_v2.instance2.id}
    INSTANCE2_IDLE_MINUTES=10
  ENV
}

output "env_prod_instance2" {
  description = ".env.prod template for Instance-2 — fill in secrets before use"
  sensitive   = true
  value       = <<-ENV
    REDIS_HOST=${openstack_compute_instance_v2.instance1.network[1].fixed_ip_v4}
    REDIS_PORT=6379
    REDIS_PASSWORD=<same-password-as-instance1>

    INSTANCE1_API_URL=http://${openstack_compute_instance_v2.instance1.network[1].fixed_ip_v4}:3001
    WORKER_API_SECRET=<same-secret-as-instance1>

    S3_ENDPOINT=https://s3.${lower(var.storage_region)}.cloud.ovh.net
    S3_REGION=${lower(var.storage_region)}
    S3_BUCKET=${var.s3_bucket_name}
    S3_ACCESS_KEY=${ovh_cloud_project_user_s3_credential.s3.access_key_id}
    S3_SECRET_KEY=${ovh_cloud_project_user_s3_credential.s3.secret_access_key}

    OLLAMA_HOST=127.0.0.1
    OLLAMA_PORT=11434
    OLLAMA_MODEL=llava
  ENV
}
