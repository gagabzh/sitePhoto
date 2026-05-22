terraform {
  required_version = ">= 1.5"
  required_providers {
    ovh = {
      source  = "ovh/ovh"
      version = "~> 0.46"
    }
    openstack = {
      source  = "terraform-provider-openstack/openstack"
      version = "~> 2.1"
    }
  }
}

# OVH provider — used for vRack networking and S3 user/credential management.
# Credentials: https://www.ovh.com/auth/api/createToken
# Required rights: GET/POST/PUT/DELETE on /cloud/project/*
provider "ovh" {
  endpoint           = "ovh-eu"
  application_key    = var.ovh_application_key
  application_secret = var.ovh_application_secret
  consumer_key       = var.ovh_consumer_key
}

# OpenStack provider — used for compute instances, security groups, keypairs, object storage.
# Credentials: OVH Control Panel → Public Cloud project → Users & Roles →
#   create user → download openrc.sh → extract OS_USERNAME / OS_PASSWORD
provider "openstack" {
  auth_url    = "https://auth.cloud.ovh.net/v3"
  domain_name = "Default"
  user_name   = var.openstack_user_name
  password    = var.openstack_password
  tenant_id   = var.ovh_project_id
  region      = var.compute_region
}
