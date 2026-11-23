# Testes sem nuvem: providers simulados, nada é criado. Rodar com `tofu test` em infra/.

mock_provider "google" {
  mock_data "google_project" {
    defaults = { number = "123456789" }
  }
  mock_resource "google_cloud_run_v2_service" {
    defaults = { uri = "https://nexus-matching-abc-uc.a.run.app" }
  }
}

mock_provider "cloudflare" {
  mock_resource "cloudflare_pages_project" {
    defaults = { subdomain = "nexus.pages.dev" }
  }
}

variables {
  gcp_project_id        = "teste"
  billing_account_id    = "000000-000000-000000"
  cloudflare_account_id = "conta"
}

run "sem_imagem_nao_cria_servico" {
  command = plan

  assert {
    condition     = length(google_cloud_run_v2_service.matching) == 0
    error_message = "Sem imagem, o Cloud Run não deve ser criado."
  }
  assert {
    condition     = length(google_cloud_run_v2_service_iam_member.public) == 0
    error_message = "Sem serviço, não deve haver permissão pública."
  }
}

run "servico_escala_a_zero_com_teto" {
  command = apply

  variables {
    matching_image = "us-central1-docker.pkg.dev/teste/nexus/matching@sha256:abc"
  }

  assert {
    condition     = google_cloud_run_v2_service.matching[0].template[0].scaling[0].min_instance_count == 0
    error_message = "O serviço precisa escalar a zero."
  }
  assert {
    condition     = google_cloud_run_v2_service.matching[0].template[0].scaling[0].max_instance_count == 2
    error_message = "O teto padrão de instâncias é 2."
  }
  assert {
    condition     = google_cloud_run_v2_service.matching[0].template[0].containers[0].resources[0].cpu_idle
    error_message = "CPU deve ser cobrada só durante requisições."
  }
  assert {
    condition     = google_cloud_run_v2_service.matching[0].deletion_protection == false
    error_message = "deletion_protection impediria o destroy."
  }
  assert {
    condition     = output.matching_api_url == "https://nexus-matching-abc-uc.a.run.app"
    error_message = "A URL do serviço precisa sair como output para o build do site."
  }
}

run "cors_aceita_apenas_o_site" {
  command = apply

  variables {
    matching_image = "img"
    custom_domain  = "nexus.exemplo.com"
  }

  assert {
    condition = (
      one([for e in google_cloud_run_v2_service.matching[0].template[0].containers[0].env : e.value if e.name == "ALLOWED_ORIGINS"])
      == "https://nexus.pages.dev,https://nexus.exemplo.com"
    )
    error_message = "ALLOWED_ORIGINS deve conter só o domínio pages.dev e o domínio próprio."
  }
  assert {
    condition     = output.site_url == "https://nexus.exemplo.com"
    error_message = "Com domínio próprio, ele é a URL do site."
  }
}

run "alerta_de_orcamento" {
  command = plan

  assert {
    condition     = google_billing_budget.nexus.amount[0].specified_amount[0].units == "5"
    error_message = "Orçamento padrão de US$ 5."
  }
  assert {
    condition     = length(google_billing_budget.nexus.threshold_rules) == 3
    error_message = "Alertas em 50%, 90% e 100%."
  }
}

run "teto_de_instancias_validado" {
  command = plan

  variables {
    matching_max_instances = 50
  }

  expect_failures = [var.matching_max_instances]
}
