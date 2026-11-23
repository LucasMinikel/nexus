terraform {
  required_version = ">= 1.8"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# Autenticação:
# - Google: Application Default Credentials (`gcloud auth application-default login`).
# - Cloudflare: variável de ambiente CLOUDFLARE_API_TOKEN.
provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

provider "cloudflare" {}
