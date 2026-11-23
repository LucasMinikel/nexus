---
title: O melhor score total não é a alocação mais estável
description: Maximizar a soma das compatibilidades entre vagas e candidatos deixa pares que prefeririam trocar. Medido em 200 cenários.
date: 2026-11-17
type: tese
tags: [matching, algoritmos, geoespacial]
experiments: [vacancy-matching]
thesis:
  claim: Ao alocar candidatos a vagas, maximizar o score total (Hungarian) costuma produzir alocações instáveis, e eliminar a instabilidade (Gale–Shapley) custa pouco score.
  status: confirmada
---

## A pergunta

No experimento [Vagas e Candidatos](/experimentos/vacancy-matching), três algoritmos distribuem candidatos entre os postos das vagas:

- **Greedy**: aceita o melhor par livre a cada passo.
- **Hungarian**: encontra a alocação com a maior soma de scores possível.
- **Gale–Shapley**: candidatos escolhem vagas pela própria preferência (deslocamento, região, bolsa, área) e vagas escolhem candidatos pelos próprios critérios (competências, formação, horário).

O Hungarian é ótimo por definição, mas ótimo para quem? Uma alocação é **instável** quando existe um par vaga–candidato que prefere um ao outro em vez do que recebeu. Na prática, é o par que combinaria por fora do sistema.

## Evidência

Cenário padrão do experimento (seed 7, 12 vagas com 20 postos, 40 candidatos, pesos e restrições padrão):

| Algoritmo | Pares | Score total | Score médio | Deslocamento médio | Pares bloqueantes |
|---|---|---|---|---|---|
| Greedy | 13 | 11,06 | 85% | 12 min | 1 |
| Hungarian | 14 | 11,75 | 84% | 13 min | 3 |
| Gale–Shapley | 14 | 11,61 | 83% | 12 min | 0 |

Em 200 cenários gerados (seeds 1 a 200, mesmo tamanho):

- O Hungarian deixou pelo menos um par bloqueante em **174 de 200** cenários (87%).
- Média de pares bloqueantes: Greedy 1,79; Hungarian 2,42; Gale–Shapley 0.
- O Gale–Shapley perdeu em média **5,0%** do score total em relação ao Hungarian.

## Conclusão

Confirmada para este modelo: a alocação de maior score é quase sempre instável, e trocar para uma alocação estável custa cerca de 5% de score. Num sistema real de vagas, a estabilidade tende a valer mais que esses 5%, porque pares bloqueantes viram desistências e acordos por fora.

## Limites

- Vale para as utilidades definidas no experimento. Com outras preferências de cada lado, os números mudam.
- Os dados são sintéticos.
- Para reproduzir: abra o experimento, use a seed 7 e compare a coluna “Pares bloqueantes”. A contagem em 200 seeds usa a mesma função `runMatching` do site.
