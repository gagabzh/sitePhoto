# ── OVH API credentials ──────────────────────────────────────────────────────
# Create a token at https://www.ovh.com/auth/api/createToken
# Required rights: GET/POST/PUT/DELETE /cloud/project/*

variable "ovh_application_key" {
  type        = string
  description = "OVH API application key"
}

variable "ovh_application_secret" {
  type        = string
  sensitive   = true
  description = "OVH API application secret"
}

variable "ovh_consumer_key" {
  type        = string
  sensitive   = true
  description = "OVH API consumer key"
}

# ── Project & region ──────────────────────────────────────────────────────────
# project_id is the alphanumeric string in the URL of your Public Cloud project
# e.g. https://www.ovh.com/manager/#/public-cloud/pci/projects/<project_id>

variable "ovh_project_id" {
  type        = string
  description = "OVH Public Cloud project ID (service_name)"
}

variable "compute_region" {
  type        = string
  default     = "GRA11"
  description = "OpenStack region for compute instances (check availability in your project)"
}

variable "storage_region" {
  type        = string
  default     = "GRA"
  description = "OpenStack region for Object Storage (Swift/S3)"
}

# ── OpenStack credentials ─────────────────────────────────────────────────────
# OVH Control Panel → Public Cloud → Users & Roles → create user →
#   assign ObjectStore operator + Compute operator roles → download openrc.sh

variable "openstack_user_name" {
  type        = string
  description = "OpenStack user name (from OVH Users & Roles)"
}

variable "openstack_password" {
  type        = string
  sensitive   = true
  description = "OpenStack user password"
}

# ── SSH access ────────────────────────────────────────────────────────────────
# Generate with: ssh-keygen -t ed25519 -C "sitephoto-deploy"
# Store the private key as GitHub Actions secrets INSTANCE1_SSH_KEY / INSTANCE2_SSH_KEY

variable "ssh_public_key" {
  type        = string
  description = "SSH public key content (e.g. 'ssh-ed25519 AAAA... comment')"
}

# ── Instance sizing ───────────────────────────────────────────────────────────
# Instance-1 (always on, serves the site): General Purpose b3-8 (4 vCPU, 8 GB)
# Instance-2 (AI worker, on-demand):        CPU Optimised c3-8 (4 vCPU, 8 GB)
#   upgrade to c3-16 if llava model is slow or you switch to a larger model

variable "instance1_flavor" {
  type        = string
  default     = "b3-8"
  description = "Flavor for Instance-1 (site + PostgreSQL + Redis)"
}

variable "instance2_flavor" {
  type        = string
  default     = "c3-8"
  description = "Flavor for Instance-2 (worker + Ollama)"
}

variable "ubuntu_image_name" {
  type        = string
  default     = "Ubuntu 24.04"
  description = "OS image name — must match exactly what OVH exposes in the region"
}

# ── Application ───────────────────────────────────────────────────────────────

variable "git_repo_url" {
  type        = string
  default     = "https://github.com/gagabzh/sitePhoto.git"
  description = "Git repository cloned on both instances during cloud-init"
}

variable "s3_bucket_name" {
  type        = string
  default     = "photo-storage"
  description = "OVH Object Storage container / S3 bucket name"
}
