# Infraestrutura e custo

Objetivo: custo próximo de zero e nada ligado esperando visitas. **Toda a nuvem é definida como código em [`infra/`](../infra/README.md) (OpenTofu)**: é possível revisar cada mudança com `plan`, testar sem nuvem com `tofu test` e apagar tudo com `./infra/destroy.sh`.

## Camadas

| Camada | Onde roda | Custo quando ninguém visita | Recurso no OpenTofu |
|---|---|---|---|
| Site e páginas (Astro, HTML estático) | CDN (Cloudflare Pages) | R$ 0 | `cloudflare_pages_project.site` |
| Experimentos no navegador | Navegador do visitante | R$ 0 | — |
| Serviços sob demanda | Cloud Run, mínimo de 0 instâncias | R$ 0 (escala a zero) | `google_cloud_run_v2_service.matching` |
| Imagens dos serviços | Artifact Registry, só as 3 últimas | centavos ou cota gratuita | `google_artifact_registry_repository.nexus` |
| Alerta de orçamento | Billing do Google Cloud | R$ 0 | `google_billing_budget.nexus` |

O campo `runtimes` de cada experimento em `src/data/experiments.ts` é exibido no site, para deixar claro o que roda onde.

## Fluxo de deploy

`infra/deploy.sh` encadeia:

1. `tofu apply` da infra base (repositório de imagens, conta de serviço, orçamento, projeto do Pages).
2. Build e push da imagem de `services/matching`, identificada pelo digest.
3. `tofu apply` com a imagem nova no Cloud Run.
4. Build do site com `SITE_URL` e `PUBLIC_MATCHING_API_URL` vindos dos outputs do OpenTofu e upload com `wrangler pages deploy`.

O site é publicado por upload direto, sem integração GitHub ↔ Cloudflare configurada em painel.

## Decisões

- **Cloudflare Pages** para o site: o plano gratuito não cobra tráfego.
- Descartado **Cloud Storage + Cloud CDN**: exige load balancer HTTP(S), com custo mensal fixo mesmo sem tráfego.
- **Cloud Run** com `min_instance_count = 0`, `cpu_idle = true` (CPU cobrada só em requisições) e `max_instance_count` validado entre 1 e 5 (teto de custo).
- Região **us-central1** (Tier 1, mais barata). Trocar `gcp_region` se a latência para o Brasil virar requisito de algum experimento.
- WebSocket (experimentos multiplayer futuros) mantém a instância ligada enquanto houver conexão; vai exigir timeout de inatividade.

## Serviço `services/matching`

Opção “Google Cloud Run” do experimento Vagas e Candidatos. Usa o mesmo código de `src/lib/matching` que o navegador, empacotado com esbuild numa imagem distroless (Node 24).

Só oferece `POST /match` (mais `GET /healthz` e `GET /policy`), só aceita JSON validado campo a campo, com limites em `LIMITS` (`src/lib/matching/api.ts`), rate limit por IP e CORS restrito a `ALLOWED_ORIGINS`, que o OpenTofu preenche com os domínios do site.

Rodar localmente, sem nuvem:

```sh
npm run service:dev                                  # serviço em :8080, aceita http://localhost:4321
PUBLIC_MATCHING_API_URL=http://localhost:8080 npm run dev
```

Sem `PUBLIC_MATCHING_API_URL`, o site funciona normalmente e a opção Cloud Run aparece desativada.

## Próximos serviços

Cada serviço novo entra em `infra/` com o mesmo padrão: recurso Cloud Run com `count` condicionado à imagem, escala a zero, teto de instâncias, conta de serviço própria e testes em `infra/tests/`.

## Dados geoespaciais e mapas

Quando um experimento precisar de mapa real:

- Biblioteca: MapLibre GL JS (open source, sem cobrança por carregamento).
- Tiles: arquivo PMTiles estático no próprio CDN, em vez de provedor pago por requisição. `tile.openstreetmap.org` não pode ser usado como CDN de produção.
- Roteamento: pré-calcular matrizes de tempo offline (OSRM/Valhalla local) e publicar como JSON estático sempre que possível; servidor de roteamento só no Cloud Run, se o experimento exigir rotas arbitrárias.
- Atribuição obrigatória ao OpenStreetMap (ODbL).
