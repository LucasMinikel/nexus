---
title: Como manter um portfólio interativo com custo perto de zero
description: As decisões de arquitetura do NEXUS — CDN para as páginas, navegador para os cálculos e Cloud Run só sob demanda.
date: 2026-11-17
type: nota
tags: [arquitetura, custo, cloud-run, cdn]
experiments: [nexus-architecture]
---

O NEXUS tem experimentos interativos, mas não deve ter servidor ligado esperando visitas. Esta nota registra as decisões que mantêm o custo perto de zero e o que cada uma sacrifica.

## 1. Páginas estáticas num CDN

O site é gerado com Astro em arquivos HTML prontos e servido pelo Cloudflare Pages. Nenhum código roda no servidor para montar uma página, e o plano gratuito não cobra tráfego.

Descartado: **Cloud Storage + Cloud CDN** no Google Cloud. Exige um load balancer HTTP(S), que tem custo mensal fixo mesmo sem nenhuma visita.

## 2. Cálculos no navegador por padrão

Os algoritmos são TypeScript que roda no processador de quem visita. O painel “Como esta página chegou até você”, presente em todas as páginas, conta as chamadas a servidores de processamento. Usando os experimentos no modo navegador, o contador fica em zero.

## 3. Nuvem só quando o visitante pede

Quando um experimento precisa de servidor, ele roda no Cloud Run com **mínimo de zero instâncias**: sem uso, nada fica ligado e nada é cobrado. O preço é a **partida a frio**: a primeira chamada depois de um tempo parado espera o servidor iniciar, e o site mostra isso ao visitante.

## 4. Um servidor que só faz uma coisa

O serviço aceita uma única rota, só JSON validado campo a campo, com limites de tamanho, de requisições por minuto e de instâncias. Áudio, arquivos e outros sites são recusados. A checagem de origem pode ser forjada fora do navegador, então o teto de custo vem dos limites e de um alerta de orçamento, não dela.

## O que fica de fora

- Recursos que exigem estado permanente no servidor, como bancos gerenciados, ficam para quando houver motivo real.
- Experimentos com WebSocket (multiplayer) mantêm a instância ligada enquanto a partida durar. Vão precisar de timeout de inatividade.

Detalhes ao vivo em [Como o NEXUS funciona](/como-funciona).
