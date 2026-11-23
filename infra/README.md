# Infraestrutura do NEXUS (OpenTofu)

Toda configuração de nuvem do NEXUS está aqui. Nada é criado à mão em console.

> **Status:** ainda não aplicado. Por enquanto o projeto roda só localmente; a infra é verificada com `tofu validate` e `tofu test` (providers simulados).

| Arquivo | O que define |
|---|---|
| `gcp.tf` | APIs, Artifact Registry (com limpeza de imagens antigas), conta de serviço, Cloud Run com escala a zero, acesso público e alerta de orçamento |
| `cloudflare.tf` | Projeto do Cloudflare Pages e domínio próprio opcional |
| `variables.tf` | Parâmetros, com validação do teto de instâncias e do orçamento |
| `outputs.tf` | URLs que o build do site consome (`SITE_URL`, `PUBLIC_MATCHING_API_URL`) |
| `tests/` | Testes com providers simulados: não precisam de credenciais nem criam nada |
| `deploy.sh` / `destroy.sh` | Encadeiam OpenTofu, Docker e Wrangler |

## Ferramentas

No NixOS: `nix shell nixpkgs#opentofu nixpkgs#google-cloud-sdk`. Também são necessários Docker e Node 24.

## Testar (sem nuvem)

```sh
cd infra
tofu init -backend=false
tofu fmt -check && tofu validate && tofu test
```

O CI roda esses três comandos em todo push.

## Primeiro deploy

1. Criar um projeto no Google Cloud com faturamento ativo. O projeto e a conta de faturamento não são gerenciados aqui.
2. `gcloud auth application-default login` com uma conta que possa administrar o projeto e criar orçamentos na conta de faturamento (papel *Billing Account Costs Manager* ou superior).
3. Criar na Cloudflare um API token com permissão *Cloudflare Pages: Edit* e exportar `CLOUDFLARE_API_TOKEN`.
4. `cp terraform.tfvars.example terraform.tfvars` e preencher.
5. `./deploy.sh`

O script mostra o plano do OpenTofu e pede confirmação antes de cada `apply`.

## Ver o que mudaria

```sh
tofu plan -var "matching_image=$(tofu output -raw matching_image)"
```

## Apagar tudo

```sh
./destroy.sh
```

Remove Cloud Run, imagens, conta de serviço, orçamento e o projeto do Pages, incluindo os deploys publicados. As APIs do Google continuam habilitadas e o projeto GCP não é apagado.

## Estado

O estado fica em `infra/terraform.tfstate`, local e fora do git. Sem ele, o OpenTofu não sabe o que apagar: faça backup ou migre para um bucket GCS (`backend "gcs"`) quando o deploy passar a rodar no CI.

## Limites

- O alerta de orçamento **avisa**, não bloqueia gastos. O teto real vem de `matching_max_instances` e dos limites do próprio serviço.
- `ALLOWED_ORIGINS` aceita o domínio de produção (`<projeto>.pages.dev` e o domínio próprio). URLs de preview do Pages não conseguem chamar o serviço.
