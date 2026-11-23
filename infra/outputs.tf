output "site_url" {
  description = "URL pública do site; vira SITE_URL no build."
  value       = var.custom_domain != "" ? "https://${var.custom_domain}" : "https://${cloudflare_pages_project.site.subdomain}"
}

output "pages_project_name" {
  value = cloudflare_pages_project.site.name
}

output "image_repository" {
  description = "Prefixo das imagens no Artifact Registry."
  value       = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.nexus.repository_id}"
}

output "matching_api_url" {
  description = "URL do serviço Cloud Run; vira PUBLIC_MATCHING_API_URL no build. Vazio se o serviço não existe."
  value       = local.matching_enabled ? google_cloud_run_v2_service.matching[0].uri : ""
}

output "allowed_origins" {
  value = local.site_origins
}

output "matching_image" {
  description = "Imagem em produção; o deploy a reutiliza no primeiro apply."
  value       = var.matching_image
}
