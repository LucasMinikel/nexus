# Fontes

Subconjuntos (latim + símbolos usados no site) gerados localmente com fontTools a partir dos arquivos instalados na máquina.

| Arquivo | Fonte | Licença |
|---|---|---|
| `heroscn-*.woff` | TeX Gyre Heros Condensed 2.501, negrito e negrito itálico (GUST e-foundry) | GUST Font License |
| `heros-*.woff` | TeX Gyre Heros 2.501 (GUST e-foundry) | GUST Font License |
| `jbmono-*.woff` | JetBrains Mono (via Nerd Fonts 3.5.0, só glifos latinos) | SIL Open Font License 1.1 |

Para regenerar: `python -m fontTools.subset <fonte> --unicodes=<faixa> --flavor=woff --layout-features='kern,liga,calt,tnum,lnum'` (faixa usada em `docs/design.md`).
