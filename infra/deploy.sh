#!/usr/bin/env bash
# Deploy completo do NEXUS. Toda a infraestrutura vem do OpenTofu (infra/*.tf);
# este script só encadeia: infra → imagem do serviço → infra com a imagem nova → build e upload do site.
#
# Pré-requisitos: tofu, docker, node; `gcloud auth application-default login`;
# CLOUDFLARE_API_TOKEN exportado; infra/terraform.tfvars preenchido.
# AUTO_APPROVE=1 pula as confirmações do tofu.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
APPROVE=()
[[ "${AUTO_APPROVE:-0}" == "1" ]] && APPROVE=(-auto-approve)
WRANGLER_VERSION=4

tofu init -input=false >/dev/null

# 1. Infra base. Mantém a imagem atual do serviço (vazia no primeiro deploy).
current_image="$(tofu output -raw matching_image 2>/dev/null || true)"
echo "==> 1/4 infra (imagem atual: ${current_image:-nenhuma})"
tofu apply "${APPROVE[@]}" -var "matching_image=${current_image}"

# 2. Imagem do serviço, identificada pelo digest para o deploy ser reprodutível.
repo="$(tofu output -raw image_repository)"
tag="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || date +%s)"
echo "==> 2/4 imagem ${repo}/matching:${tag}"
gcloud auth configure-docker "${repo%%/*}" --quiet >/dev/null
docker build -f "$ROOT/services/matching/Dockerfile" -t "${repo}/matching:${tag}" "$ROOT"
docker push "${repo}/matching:${tag}" >/dev/null
image="$(docker inspect --format '{{index .RepoDigests 0}}' "${repo}/matching:${tag}")"

# 3. Cloud Run com a imagem nova.
echo "==> 3/4 Cloud Run com ${image}"
tofu apply "${APPROVE[@]}" -var "matching_image=${image}"

# 4. Site estático com as URLs que o OpenTofu publicou.
echo "==> 4/4 site"
SITE_URL="$(tofu output -raw site_url)"
PUBLIC_MATCHING_API_URL="$(tofu output -raw matching_api_url)"
export SITE_URL PUBLIC_MATCHING_API_URL
(cd "$ROOT" && npm ci && npm run build)
npx --yes "wrangler@${WRANGLER_VERSION}" pages deploy "$ROOT/dist" \
  --project-name "$(tofu output -raw pages_project_name)" --branch main --commit-dirty=true

echo "Publicado em ${SITE_URL}"
