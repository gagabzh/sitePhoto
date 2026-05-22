# ── Object Storage bucket ─────────────────────────────────────────────────────
# Creates an OVH Object Storage container accessible via S3-compatible API.
# Endpoint: https://s3.gra.cloud.ovh.net (or the region-specific equivalent)
# Both Instance-1 (uploads) and Instance-2 (downloads for AI) use this bucket.

resource "openstack_objectstorage_container_v1" "photos" {
  region = var.storage_region
  name   = var.s3_bucket_name

  # Private — no anonymous public access
  metadata = {
    "X-Container-Read" = ""
  }
}

# ── S3 user and credentials ───────────────────────────────────────────────────
# Creates a dedicated OVH Public Cloud user with ObjectStore operator rights
# and generates S3 access/secret keys for it.
# These credentials are used on both instances via S3_ACCESS_KEY / S3_SECRET_KEY env vars.

resource "ovh_cloud_project_user" "s3" {
  service_name = var.ovh_project_id
  description  = "sitephoto S3 operator"
  role_name    = "objectstore_operator"
}

resource "ovh_cloud_project_user_s3_credential" "s3" {
  service_name = var.ovh_project_id
  user_id      = ovh_cloud_project_user.s3.id
}
