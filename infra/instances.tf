# ── SSH keypair ───────────────────────────────────────────────────────────────

resource "openstack_compute_keypair_v2" "deployer" {
  name       = "sitephoto-deployer"
  public_key = var.ssh_public_key
}

# ── Image lookup ──────────────────────────────────────────────────────────────

data "openstack_images_image_v2" "ubuntu" {
  name        = var.ubuntu_image_name
  most_recent = true
}

# ── cloud-init: Instance-1 ────────────────────────────────────────────────────

locals {
  instance1_userdata = <<-CLOUD_INIT
    #!/bin/bash
    set -e
    # Wait for unattended-upgrades to release the apt lock (runs automatically on first boot)
    systemctl disable --now unattended-upgrades || true
    while ! apt-get -o DPkg::Lock::Timeout=120 update -qq; do sleep 5; done
    apt-get -o DPkg::Lock::Timeout=120 install -y -qq git ufw curl
    curl -fsSL https://get.docker.com | sh

    # Firewall — allow public traffic on 22/80/443, vRack-only on 6379/3001
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 443/udp
    ufw allow from 10.0.0.0/24 to any port 6379
    ufw allow from 10.0.0.0/24 to any port 3001
    ufw --force enable

    usermod -aG docker ubuntu
    su - ubuntu -c "git clone ${var.git_repo_url} ~/sitephoto"
    echo "sitephoto instance-1 init done" > /var/log/sitephoto-init.log
  CLOUD_INIT

  # Instance-2: SSH reachable from vRack only (jump via Instance-1).
  # Ollama model must be pulled manually after first boot: ollama pull llava
  instance2_userdata = <<-CLOUD_INIT
    #!/bin/bash
    set -e
    # Wait for unattended-upgrades to release the apt lock (runs automatically on first boot)
    systemctl disable --now unattended-upgrades || true
    while ! apt-get -o DPkg::Lock::Timeout=120 update -qq; do sleep 5; done
    apt-get -o DPkg::Lock::Timeout=120 install -y -qq git curl ufw
    curl -fsSL https://get.docker.com | sh

    # Firewall — no public inbound, SSH from vRack only
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow from 10.0.0.0/24 to any port 22
    ufw --force enable

    usermod -aG docker ubuntu
    su - ubuntu -c "git clone ${var.git_repo_url} ~/sitephoto"
    curl -fsSL https://ollama.com/install.sh | sh
    systemctl enable --now ollama
    echo "sitephoto instance-2 init done (pull llava manually)" > /var/log/sitephoto-init.log
  CLOUD_INIT
}

# ── Instance-1 — site + PostgreSQL + Redis ────────────────────────────────────
# Always-on. Serves the site on ports 80/443 (Caddy) and exposes Redis + internal
# API on the vRack private interface only.

resource "openstack_compute_instance_v2" "instance1" {
  name        = "sitephoto-instance1"
  image_id    = data.openstack_images_image_v2.ubuntu.id
  flavor_name = var.instance1_flavor
  key_pair    = openstack_compute_keypair_v2.deployer.name
  user_data   = local.instance1_userdata

  # Ext-Net first → becomes eth0 and the default route (public internet)
  network {
    name = "Ext-Net"
  }

  # vRack second → becomes eth1 (Redis + internal API exposure)
  network {
    uuid = data.openstack_networking_network_v2.private.id
  }
}

# ── Instance-2 — worker + Ollama ─────────────────────────────────────────────
# On-demand or always-on. No public inbound ports.
# SSH reachable only via Instance-1 as a jump host (10.0.0.x vRack IP).
# GitHub Actions uses proxy_host = Instance-1 public IP.

resource "openstack_compute_instance_v2" "instance2" {
  name        = "sitephoto-instance2"
  image_id    = data.openstack_images_image_v2.ubuntu.id
  flavor_name = var.instance2_flavor
  key_pair    = openstack_compute_keypair_v2.deployer.name
  user_data   = local.instance2_userdata

  # Ext-Net for outbound internet (S3 API, Docker Hub, Ollama model downloads)
  network {
    name = "Ext-Net"
  }

  # vRack for Redis access and receiving SSH from Instance-1
  network {
    uuid = data.openstack_networking_network_v2.private.id
  }
}
