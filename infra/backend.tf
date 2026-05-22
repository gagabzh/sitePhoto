terraform {
  # State is stored locally in terraform.tfstate (gitignored).
  # This is fine for a solo project — back up terraform.tfstate manually.
  #
  # To migrate to OVH Object Storage (recommended for teams):
  #
  # 1. Create a dedicated state bucket manually (separate from the app bucket):
  #      openstack container create sitephoto-tfstate --region GRA
  #
  # 2. Generate a separate S3 credential for the state bucket:
  #      openstack ec2 credentials create
  #
  # 3. Replace the block below with:
  #
  #    backend "s3" {
  #      bucket                      = "sitephoto-tfstate"
  #      key                         = "terraform.tfstate"
  #      region                      = "gra"
  #      endpoint                    = "https://s3.gra.cloud.ovh.net"
  #      access_key                  = "<ec2-access-key>"
  #      secret_key                  = "<ec2-secret-key>"
  #      skip_credentials_validation = true
  #      skip_region_validation      = true
  #      skip_metadata_api_check     = true
  #      force_path_style            = true
  #    }
  #
  # 4. Run: terraform init -migrate-state
  #    Terraform will upload local state to the bucket and confirm the migration.

  backend "local" {}
}
