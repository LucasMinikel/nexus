#!/usr/bin/env bash
# Apaga tudo o que o OpenTofu criou: Cloud Run, imagens, conta de serviço, orçamento e projeto do Pages.
# As APIs do Google ficam habilitadas (disable_on_destroy = false) e o projeto GCP não é apagado.
set -euo pipefail
cd "$(dirname "$0")"
tofu init -input=false >/dev/null
tofu destroy -var "matching_image=$(tofu output -raw matching_image 2>/dev/null || true)"
