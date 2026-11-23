---
title: Para cálculos pequenos, o navegador vence a nuvem
description: Mandar o cálculo para o Cloud Run só compensa quando ele é pesado demais para o dispositivo. Primeiras medições, ainda sem o serviço publicado.
date: 2026-11-17
type: tese
tags: [arquitetura, cloud-run, custo, performance]
experiments: [vacancy-matching, nexus-architecture]
thesis:
  claim: No experimento de vagas, calcular no navegador do visitante é mais rápido que enviar o cálculo ao Cloud Run, porque o tempo de rede e a partida a frio superam o tempo de cálculo.
  status: em-aberto
---

## A pergunta

O experimento [Vagas e Candidatos](/experimentos/vacancy-matching) deixa o visitante escolher onde as alocações são calculadas: no próprio navegador ou no Google Cloud Run. Os dois lados executam exatamente a mesma função, e o site confere se os resultados são idênticos.

Qual é mais rápido, e a partir de que tamanho de problema a nuvem passa a compensar?

## O que já foi medido

Ambiente local: serviço rodando na mesma máquina, sem internet no caminho.

| Medição | Tempo |
|---|---|
| Cálculo em Node.js, instância já aquecida (média de 50 execuções) | ~1,1 ms |
| Primeira requisição ao serviço recém-iniciado (cálculo no servidor) | ~27–33 ms |
| Ida e volta navegador → serviço local, primeira chamada | ~58 ms |

Mesmo sem internet no caminho, a ida e volta já custa dezenas de vezes o tempo do cálculo.

## O que falta para fechar

- Medir contra o serviço publicado no Cloud Run (região `us-central1`), a partir do Brasil, com instância fria e quente.
- Medir o tempo de cálculo no navegador em dispositivos diferentes, inclusive celulares modestos.
- Aumentar o cenário até encontrar o ponto em que a nuvem empata com o navegador.

O painel “Onde calcular as alocações?” do experimento já mostra todas essas medidas para quem o usa. Quando o serviço estiver publicado, este post será atualizado com os números reais e o status da tese.
