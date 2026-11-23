# NEXUS

Portfólio que se prova rodando, em duas áreas:

1. **Lab**: hipóteses, algoritmos e curiosidades testados ao vivo no navegador, cada um com veredito calculado e regra explícita.
2. **Projetos**: sistemas completos rodando, para verificar de ponta a ponta.

O site mostra apenas o que já funciona.

O plano do que ainda será construído fica em `docs/roadmap.md`.

Cada projeto é uma demonstração funcional com parâmetros manipuláveis, visualização do funcionamento interno, métricas, comparação de algoritmos, explicação técnica, implementação identificada e limitações documentadas.

## Rodar

O projeto de documentos usa o [doc-check](../doc-check), um repositório irmão ligado por caminho local
(`"doc-check": "file:../doc-check"`): antes do `npm install`, ele precisa estar ao lado desta pasta. Ainda não está
no GitHub, então o build na CI e o deploy não funcionam até a dependência virar `github:LucasMinikel/doc-check#<versão>`.

```sh
npm install
npm run dev     # http://localhost:4321
npm test        # testes dos algoritmos
npm run build   # type-check + site estático em dist/
npm run service:dev   # serviço Cloud Run do experimento de vagas, local em :8080
```

Deploy, testes da infraestrutura e remoção de tudo: [`infra/README.md`](infra/README.md). Toda configuração de nuvem é feita por OpenTofu, nunca à mão.

## Estrutura

```
src/
  data/experiments.ts    testes do Lab e projetos publicados (só o que já funciona)
  data/profile.ts        nome e textos da home
  lib/                   algoritmos puros, testados com Vitest
  components/            componentes Astro e ilhas React dos experimentos
  components/transparency/  painel "Como esta página chegou até você"
  pages/                 rotas: / (rede 3D), /lab (hipóteses testadas ao vivo), /projetos (sistemas completos)
services/matching/       serviço Cloud Run (escala a zero) do experimento de vagas
docs/roadmap.md          tudo o que o NEXUS pretende ter e demonstrar, com status
docs/infraestrutura.md   hospedagem, Cloud Run sob demanda e custos
infra/                   toda a nuvem como código (OpenTofu): Cloud Run, Artifact Registry, orçamento, Cloudflare Pages
```

## Adicionar um teste ao Lab

Um teste é uma hipótese com veredito calculado ao vivo, não um texto.

1. Lógica pura em `src/lib/lab/<teste>.ts`: uma rodada, o resumo e a regra do veredito (`RULE`), com testes em `lab.test.ts`.
2. Ilha em `src/components/lab/`, dentro de `LabTest` (hipótese, veredito, regra, link do código), adicionada a `src/pages/lab/index.astro`.
3. Registrar em `labTests` (`src/data/experiments.ts`).

## Adicionar um projeto

1. Implementar a lógica em `src/lib/<projeto>/` com testes.
2. Criar a ilha em `src/components/<projeto>/`, embutir em `src/pages/projetos/index.astro` e criar `src/pages/projetos/<slug>.astro`, seguindo `vagas.astro` (demo, como funciona, implementação, limitações).
3. Registrar em `projects` (`src/data/experiments.ts`) com os tópicos efetivamente demonstrados.
4. Marcar o item como ✅ em `docs/roadmap.md`, com link e pendências restantes.
5. Preferir execução no navegador. Usar `cloud-run` só se for inevitável (ver `docs/infraestrutura.md`).
