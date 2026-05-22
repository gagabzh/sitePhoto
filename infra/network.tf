# ── vRack private network ─────────────────────────────────────────────────────
# Connects Instance-1 and Instance-2 on an isolated L2 network.
# Redis (port 6379) and the internal API (port 3001) are only reachable on this network.
# Firewall rules are enforced by ufw inside each instance (see instances.tf cloud-init)
# rather than OpenStack security groups, which require a quota increase on new projects.

resource "ovh_cloud_project_network_private" "private" {
  service_name = var.ovh_project_id
  name         = "photo-private-network"
  regions      = [var.compute_region]
}

resource "ovh_cloud_project_network_private_subnet" "private" {
  service_name = var.ovh_project_id
  network_id   = ovh_cloud_project_network_private.private.id
  region       = var.compute_region
  start        = "10.0.0.2"
  end          = "10.0.0.254"
  network      = "10.0.0.0/24"
  dhcp         = true
  no_gateway   = true
}

# Resolve the OpenStack UUID for the vRack network.
# ovh_cloud_project_network_private.private.id returns the OVH internal ID (pn-XXXXXX_0)
# which is not accepted by openstack_compute_instance_v2 — it needs the OpenStack UUID.
data "openstack_networking_network_v2" "private" {
  name       = ovh_cloud_project_network_private.private.name
  depends_on = [ovh_cloud_project_network_private_subnet.private]
}
