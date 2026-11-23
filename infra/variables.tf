variable "gcp_project_id" {
  description = "Projeto do Google Cloud onde ficam o Cloud Run e o Artifact Registry."
  type        = string
}

variable "gcp_region" {
  description = "Região do Cloud Run. Regiões Tier 1 (ex.: us-central1) são mais baratas que southamerica-east1."
  type        = string
  default     = "us-central1"
}

variable "billing_account_id" {
  description = "Conta de faturamento (formato XXXXXX-XXXXXX-XXXXXX), usada pelo alerta de orçamento."
  type        = string
}

variable "budget_amount_usd" {
  description = "Orçamento mensal em USD. O alerta avisa ao atingir 50%, 90% e 100%; ele não bloqueia gastos."
  type        = number
  default     = 5

  validation {
    condition     = var.budget_amount_usd > 0
    error_message = "O orçamento precisa ser positivo."
  }
}

variable "cloudflare_account_id" {
  description = "ID da conta Cloudflare onde fica o projeto do Pages."
  type        = string
}

variable "pages_project_name" {
  description = "Nome do projeto no Cloudflare Pages; define o domínio <nome>.pages.dev."
  type        = string
  default     = "nexus"
}

variable "custom_domain" {
  description = "Domínio próprio do site (ex.: nexus.exemplo.com). Vazio: usa só o domínio pages.dev."
  type        = string
  default     = ""
}

variable "matching_image" {
  description = "Imagem do serviço de matching (com digest). Vazio: o serviço Cloud Run não é criado."
  type        = string
  default     = ""
}

variable "matching_max_instances" {
  description = "Teto de instâncias do Cloud Run: limita o custo máximo em caso de abuso."
  type        = number
  default     = 2

  validation {
    condition     = var.matching_max_instances >= 1 && var.matching_max_instances <= 5
    error_message = "Use entre 1 e 5 instâncias; acima disso o teto de custo deixa de ser um teto."
  }
}
