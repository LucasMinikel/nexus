locals {
  services = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
  ]

  site_origins = compact([
    "https://${cloudflare_pages_project.site.subdomain}",
    var.custom_domain != "" ? "https://${var.custom_domain}" : "",
  ])

  matching_enabled = var.matching_image != ""
}

data "google_project" "this" {}

resource "google_project_service" "apis" {
  for_each = toset(local.services)
  service  = each.value
  # Ao destruir, não desliga as APIs: outras coisas do projeto podem depender delas.
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "nexus" {
  repository_id = "nexus"
  location      = var.gcp_region
  format        = "DOCKER"
  description   = "Imagens dos serviços do NEXUS"

  # Mantém só as últimas versões: armazenamento acima da cota gratuita custa.
  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "manter-ultimas-3"
    action = "KEEP"
    most_recent_versions {
      keep_count = 3
    }
  }
  cleanup_policies {
    id     = "apagar-antigas"
    action = "DELETE"
    condition {
      older_than = "604800s" # 7 dias
    }
  }

  depends_on = [google_project_service.apis]
}

# Identidade própria do serviço, sem nenhuma permissão: ele só calcula e responde.
resource "google_service_account" "matching" {
  account_id   = "nexus-matching"
  display_name = "NEXUS matching (Cloud Run)"
}

resource "google_cloud_run_v2_service" "matching" {
  count    = local.matching_enabled ? 1 : 0
  name     = "nexus-matching"
  location = var.gcp_region
  ingress  = "INGRESS_TRAFFIC_ALL"

  # Precisa ser false para que `tofu destroy` consiga apagar o serviço.
  deletion_protection = false

  template {
    service_account                  = google_service_account.matching.email
    timeout                          = "10s"
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = 0 # escala a zero: sem visitas, sem custo
      max_instance_count = var.matching_max_instances
    }

    containers {
      image = var.matching_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
        cpu_idle = true # CPU cobrada só durante requisições
      }

      env {
        name  = "ALLOWED_ORIGINS"
        value = join(",", local.site_origins)
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# Acesso público: a proteção fica no próprio serviço (rota única, validação, rate limit, CORS).
resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = local.matching_enabled ? 1 : 0
  name     = google_cloud_run_v2_service.matching[0].name
  location = var.gcp_region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_billing_budget" "nexus" {
  billing_account = var.billing_account_id
  display_name    = "NEXUS"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.budget_amount_usd)
    }
  }

  dynamic "threshold_rules" {
    for_each = [0.5, 0.9, 1.0]
    content {
      threshold_percent = threshold_rules.value
    }
  }

  depends_on = [google_project_service.apis]
}
