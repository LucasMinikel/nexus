# Roadmap do NEXUS

O que o NEXUS pretende ter e demonstrar. **Este documento é o plano; o site só mostra o que já está implementado.**
Ao implementar um item: criar o experimento no site (`src/data/experiments.ts`), marcar aqui como ✅ com o link e manter o padrão abaixo.

## Padrão de todo experimento

- Demonstração funcional.
- Parâmetros manipuláveis.
- Visualização do funcionamento interno.
- Métricas calculadas.
- Comparação de algoritmos.
- Explicação técnica.
- Implementação identificada.
- Limitações documentadas.

Prioridade: experiências em que o visitante observa agentes e algoritmos tomando decisões, muda regras e vê o comportamento do sistema mudar. Execução no navegador por padrão (custo zero); Cloud Run só quando inevitável (ver `docs/infraestrutura.md`).

## Status

| | Experimento | Seção | Execução |
|---|---|---|---|
| ⬜ | Jogue contra a IA | 1.1 AI as a Player | navegador |
| ⬜ | Partida com equipes mistas | 1.2 Multiplayer AI | Cloud Run |
| ⬜ | Arena de disputa de recursos | 1.3 Multi-Agent Game Simulation | navegador |
| ⬜ | Mundo 2D com regras editáveis | 1.4 Game World Simulation | navegador |
| ⬜ | Inspetor de agentes | 1.5 Game AI Visualization | navegador |
| ⬜ | Simulador de netcode | 1.6 Multiplayer Game Engineering | navegador |
| ⬜ | Explorador espacial | 2.1 Maps & Spatial Visualization | navegador |
| ⬜ | Comparador de rotas | 2.2 Route Optimization & Pathfinding | navegador |
| ✅ | Motor de correspondência geográfica → implementado dentro de [Vagas e Candidatos](../src/pages/projetos/vagas.astro) | 2.3 Geospatial Matching Engine | navegador |
| ✅ | [Vagas e Candidatos](../src/pages/projetos/vagas.astro) | 2.4 Vacancy & Candidate Matching | navegador |
| ✅ | [Foto de documento](../src/pages/projetos/documentos.astro): verificação da foto antes do envio, do projeto doc-check (dependência local `file:../doc-check`; falta publicar no GitHub para a CI e o deploy) | Computer Vision & Document Intelligence | navegador |
| ⬜ | Living Geographic World | 3.1 Spatial Simulation | navegador |
| ⬜ | NEXUS Mobile | 4.1 Mobile App Development | navegador |
| ⬜ | Sincronização offline | 4.1 Mobile App Development | navegador |
| ⬜ | Pipeline de release visual | 4.2 Build, Release & Play Store Deploy | navegador |
| ⬜ | Simulador de rollout gradual | 4.2 Build, Release & Play Store Deploy | navegador |
| ⬜ | Observability playground | 4.3 Observability & Reliability | navegador |
| ⬜ | SLO e error budget | 4.3 Observability & Reliability | navegador |
| ⬜ | O problema da timeline do Twitter | 5.1 System Design Classics | navegador |
| ⬜ | Rate limiters | 5.1 System Design Classics | navegador |
| ⬜ | Simulador de cache | 5.2 Caching | navegador |
| ⬜ | Motor de busca do NEXUS | 5.3 Search Engines | navegador |
| ⬜ | LSM-Tree vs. B-Tree | 5.4 Designing Data-Intensive Applications | navegador |
| ⬜ | Replicação, quóruns e partições de rede | 5.4 Designing Data-Intensive Applications | navegador |
| ⬜ | Consenso com Raft | 5.4 Designing Data-Intensive Applications | navegador |
| ⬜ | Níveis de isolamento | 5.4 Designing Data-Intensive Applications | navegador |
| ⬜ | Um milhão de pontos | 6.1 Data Visualization | navegador |
| ⬜ | Dataset explorável | 6.1 Data Visualization | navegador |
| ⬜ | Monitor em tempo real com detecção de anomalias | 6.2 Monitoring Results | navegador |
| ⬜ | Laboratório de testes A/B | 6.2 Monitoring Results | navegador |
| ⬜ | NEXUS em números | 6.2 Monitoring Results | navegador |
| ⬜ | Pipeline do NEXUS visualizado | 7.1 CI/CD Pipelines | navegador |
| ⬜ | Revisor agêntico de PRs | 7.2 Agentic Code Review | Cloud Run |
| ⬜ | Benchmark de revisores | 7.2 Agentic Code Review | navegador |
| ⬜ | Automações do NEXUS | 7.3 Automation & Agentic Workflows | navegador |
| ⬜ | LLM de verdade no núcleo | 7.4 LLM no núcleo do site | navegador / Cloud Run |

Além dos experimentos, já implementado:

- ✅ Organização do site em duas áreas (decisão de 2026-11-18): **Lab** (`/lab`) com hipóteses testadas ao vivo e veredito calculado (hoje: ótimo × estável; linha reta × rede viária) e **Projetos** (`/projetos`) com sistemas completos rodando (hoje: Vagas e Candidatos e Foto de documento). Blog e página “Como funciona” saíram do site; o texto do único post foi guardado em `docs/rascunhos/`.
- ✅ Transparência da própria arquitetura: painel de entrega em todas as páginas e opção Cloud Run no projeto de vagas.
- ✅ Núcleo de linguagem v0 no centro da home e console em todas as páginas: roteador de intenções determinístico no navegador (`src/lib/nexus-graph/intent.ts`), com a atenção calculada desenhada na cena. Ainda não é um LLM; ver 7.4.

Lab, próximos passos:

- ✅ A tese “o melhor score total não é a alocação mais estável” virou o teste 01 do Lab e reproduz a medição do rascunho (87% instáveis, 5,0% de perda).
- ⬜ “Navegador vence a nuvem” como teste do Lab (depende do serviço Cloud Run publicado).
- ⬜ Primeira avaliação de ferramenta (candidatas: MapLibre vs. Leaflet; OSRM vs. Valhalla).

---

## 1. Game Intelligence & Multiplayer AI

Laboratórios em que inteligências artificiais participam de jogos: observam o ambiente, entendem estados, escolhem ações, executam estratégias, reagem a adversários, cooperam com outros agentes e aprendem com as consequências das próprias ações. Não são NPCs que apenas conversam — são agentes que jogam.

### 1.1 AI as a Player

_Área: Concepts Lab_

Experimentos em que a IA atua como um jogador real.

Tópicos: Autonomous Game Players · AI-Controlled Characters · Game State Understanding · Game Strategy Planning · Opponent Modeling · Decision Making · Action Prediction · Tactical Planning · Resource Management · Adaptive Difficulty · Player Behavior Modeling · AI Game Agents · Self-Play · Learning from Gameplay · Human vs. AI · AI vs. AI

Experimentos:

- ⬜ **Jogue contra a IA** (navegador) — Uma partida contra a IA com painel ao vivo das decisões, estratégias, objetivos e adaptações do agente durante o jogo.

### 1.2 Multiplayer AI

_Área: Concepts Lab_

Partidas multiplayer com jogadores humanos e agentes artificiais.

Tópicos: Human vs. Human · Human vs. AI · Human + AI vs. Human + AI · AI vs. AI · Mixed Multiplayer Teams · Autonomous Teammates · AI Opponents · Cooperative AI · Competitive AI · Team Coordination · Dynamic Matchmaking · Skill-Based Matchmaking · Match Balancing · Role Assignment · Player Ranking · Team Composition Optimization

Experimentos:

- ⬜ **Partida com equipes mistas** (Cloud Run) — Vários jogadores, parte humanos e parte agentes de IA. Os agentes jogam de forma independente e colaboram com os integrantes da equipe.

### 1.3 Multi-Agent Game Simulation

_Área: Concepts Lab_

Simulações com vários agentes tomando decisões simultaneamente.

Tópicos: Multi-Agent Reinforcement Learning · Cooperative Multi-Agent RL · Competitive Multi-Agent RL · Self-Play Training · Agent Communication · Emergent Strategies · Team-Based Planning · Opponent Adaptation · Reward Shaping · Hierarchical Reinforcement Learning · Imitation Learning · Monte Carlo Tree Search · Minimax · Alpha-Beta Pruning · Behavior Trees · Utility AI · GOAP

Experimentos:

- ⬜ **Arena de disputa de recursos** (navegador) — Agentes com objetivos próprios disputam recursos, territórios e pontos. Visualiza como as estratégias evoluem entre partidas.

### 1.4 Game World Simulation

_Área: Concepts Lab_

Mundos nos quais os agentes executam ações e alteram o ambiente.

Tópicos: Physics-Based Simulation · Navigation Systems · Pathfinding · Collision Detection · Spatial Awareness · Environment Interaction · Dynamic Obstacles · Resource Collection · Territory Control · Dynamic World Events · Procedural Worlds · World State Management · Simulation Replay · Time Acceleration · Scenario Generation

Experimentos:

- ⬜ **Mundo 2D com regras editáveis** (navegador) — Agentes caminham, encontram objetos, coletam recursos, enfrentam obstáculos e alteram o mundo. O visitante muda as regras e observa o comportamento coletivo.

### 1.5 Game AI Visualization

_Área: Concepts Lab_

Visualização do funcionamento interno dos jogadores artificiais.

Tópicos: Decision Trees · Behavior Trees · Goal Planning · Action Scores · Reward Functions · State Transitions · Agent Memory · Perception Radius · Threat Detection · Target Selection · Movement Planning · Strategy Comparison · Decision Replay · Action Prediction

Ao selecionar um agente, o visitante deve ver:

- O que o agente percebe.
- Quais são seus objetivos.
- Quais ações estão disponíveis.
- Como cada ação foi avaliada.
- Por que escolheu determinada ação.
- Qual foi o resultado.
- Como sua estratégia mudou.

Experimentos:

- ⬜ **Inspetor de agentes** (navegador) — Selecione um agente em qualquer simulação e veja percepção, objetivos, ações disponíveis, avaliação de cada ação, escolha, resultado e mudança de estratégia.

### 1.6 Multiplayer Game Engineering

_Área: Engineering Playground_

Engenharia de jogos multiplayer: sincronização, rede e infraestrutura.

Tópicos: Authoritative Game Server · Client Prediction · Server Reconciliation · State Synchronization · Rollback Networking · Lockstep Simulation · Network Interpolation · Lag Compensation · Tick Rate Optimization · Interest Management · Spatial Partitioning · Matchmaking Systems · Lobby Management · Anti-Cheat Architecture · Multiplayer Persistence · Real-Time Communication

Experimentos:

- ⬜ **Simulador de netcode** (navegador) — Partida simulada com latência, jitter e perda de pacotes configuráveis, comparando lado a lado diferentes estratégias de sincronização.

#### Tecnologias candidatas: Jogos e simulação

Avaliar cobertura, licença, disponibilidade e custo antes de escolher; não assumir que são gratuitas ou que têm dados de trânsito e transporte público.

| Tecnologia | Uso | Ponto de atenção |
|---|---|---|
| Godot | Motor de jogo open source com export para Web | Export Web gera bundle grande (WASM); avaliar tempo de carregamento. |
| Unity | Motor de jogo com ML-Agents | Licenciamento e tamanho do build WebGL; pouco adequado para demos leves. |
| Three.js | Renderização 3D no navegador | — |
| React Three Fiber | Three.js declarativo integrado ao React | — |
| Phaser | Framework de jogos 2D no navegador | — |
| Colyseus | Servidor multiplayer autoritativo em Node.js | Exige processo com estado; no Cloud Run, sessões WebSocket mantêm a instância ligada enquanto houver partida. |
| WebSocket | Canal bidirecional cliente-servidor | — |
| WebRTC | P2P de baixa latência (data channels) | Necessita sinalização e, em algumas redes, TURN, que tem custo de tráfego. |
| PyTorch | Treino de políticas e redes neurais | Treino deve ser offline; publicar apenas pesos pequenos ou replays. |
| Gymnasium | Interface padrão de ambientes de RL single-agent | — |
| PettingZoo | Ambientes multiagente (AEC e paralelo) | — |
| Ray RLlib | RL distribuído, inclusive multiagente | Pesado para o orçamento do projeto; usar apenas em treino local. |
| Stable-Baselines3 | Algoritmos de RL de referência (PPO, DQN, SAC) | — |

#### Conexões com projetos aplicados

Só demonstrar depois de analisar os repositórios e os requisitos reais.

- **ECHOES:** AI as a Player, Multiplayer AI, Multi-Agent Reinforcement Learning, Autonomous NPCs, Game Strategy Planning, World Simulation, Pathfinding, Dynamic Worlds, Opponent Modeling, Emergent Strategies, Multiplayer Networking.

---

## 2. Geospatial Intelligence & Smart Matching

Laboratórios de inteligência geográfica que analisam localizações, calculam distâncias, encontram caminhos, identificam regiões, comparam áreas e fazem correspondências entre entidades geográficas — muito além de mostrar pontos em um mapa.

Perguntas que a categoria deve responder:

- Qual é o caminho mais adequado?
- Qual região possui maior concentração de oportunidades?
- Quais locais estão próximos?
- Qual é a distância real entre duas localizações?
- Qual é a melhor correspondência considerando localização e compatibilidade?
- Quais opções são melhores considerando tempo de deslocamento?
- Como distribuir recursos ou oportunidades geograficamente?

### 2.1 Maps & Spatial Visualization

_Área: Concepts Lab_

Tópicos: Interactive Maps · Geospatial Visualization · Geographic Clustering · Heatmaps · Density Maps · Geofencing · Spatial Indexing · Geographic Search · Region Detection · Radius Search · Polygon Search · Spatial Joins · Point-in-Polygon · Geohash · H3 Hexagonal Indexing · Geographic Data Analysis · Spatial Aggregation

Experimentos:

- ⬜ **Explorador espacial** (navegador) — Mapa interativo com milhares de pontos, filtros por região, distância, categoria e densidade, comparando índices espaciais.

### 2.2 Route Optimization & Pathfinding

_Área: Concepts Lab_

Tópicos: A* Pathfinding · Dijkstra · BFS · Multi-Stop Routing · Shortest Path · Fastest Route · Alternative Routes · Route Optimization · Vehicle Routing Problem · Traveling Salesman Problem · Time-Dependent Routing · Multi-Modal Routing · Walking Routes · Public Transport Routes · Driving Routes · Accessibility-Aware Routing · Dynamic Route Recalculation · Obstacle Avoidance

Experimentos:

- ⬜ **Comparador de rotas** (navegador) — Origem e destino no mapa, comparação de caminhos por distância, duração estimada e número de conexões, separando distância em linha reta de distância pela rede viária.

### 2.3 Geospatial Matching Engine

_Área: Concepts Lab_

Correspondência entre entidades considerando localização, distância, região e outros critérios.

Tópicos: Location-Based Matching · Geographic Compatibility · Proximity Scoring · Travel Time Scoring · Regional Compatibility · Multi-Criteria Matching · Weighted Ranking · Candidate Ranking · Spatial Filtering · Top-K Matching · Geographic Recommendation · Location Preference Modeling · Constraint-Based Matching

Experimentos:

- ✅ **Motor de correspondência geográfica** (navegador) — Entidades com características diferentes e pesos ajustáveis de tempo de deslocamento, região e compatibilidade. Implementado no laboratório de vagas e candidatos.

### 2.4 Vacancy & Candidate Matching

_Área: Concepts Lab_

Simula o relacionamento entre vagas de trabalho ou estágio e candidatos, combinando compatibilidade profissional e localização. Restrições obrigatórias são filtros, nunca compensadas por pontuação alta em outro critério.

Tópicos: Geographic Matching · Skill Matching · Education Matching · Schedule Compatibility · Multi-Criteria Decision Analysis · Weighted Scoring · Candidate Ranking · Vacancy Ranking · Bipartite Graph Matching · Hungarian Algorithm · Stable Matching · Constraint Optimization · Recommendation Systems · Top-K Retrieval

Experimentos:

- ✅ **Vagas e Candidatos** (navegador) — Mapa com vagas e candidatos, tempo de deslocamento pela rede viária, filtros obrigatórios, score explicável por dimensão e alocação por Greedy, Hungarian e Gale–Shapley — calculada no navegador ou, por escolha do visitante, no Cloud Run.

Pendências da especificação original do 2.4 (o restante já está no experimento):

- ✅ Mapa real: ruas do OpenStreetMap das 27 capitais (10 × 10 km centrais), embutidas no site; “usar minha região” abre a capital mais próxima sem enviar a localização (2026-11-21).
- ⬜ Endereço e bairro reais das vagas e dos candidatos (hoje: posições sorteadas perto das ruas; regiões são terços × metades do quadrado).
- ⬜ Clusters geográficos e heatmap contínuo de oportunidades (hoje: sombreamento por região).
- ⬜ Áreas de cobertura por vaga (hoje: alcance apenas do candidato selecionado).
- ⬜ Comparação lado a lado entre dois candidatos para a mesma vaga.
- ⬜ Mapa real (MapLibre + OSM) e tempo de deslocamento de um serviço de roteamento, com transporte público quando houver GTFS.

#### Tecnologias candidatas: Geoespacial

Avaliar cobertura, licença, disponibilidade e custo antes de escolher; não assumir que são gratuitas ou que têm dados de trânsito e transporte público.

| Tecnologia | Uso | Ponto de atenção |
|---|---|---|
| PostgreSQL + PostGIS | Consultas espaciais, índices GiST, spatial joins | Banco gerenciado tem custo fixo; para demos, preferir dados estáticos ou SQLite/SpatiaLite. |
| pgRouting | Roteamento sobre grafo viário no PostGIS | — |
| H3 | Indexação hexagonal hierárquica (h3-js no navegador) | — |
| Turf.js | Operações geométricas no navegador (buffer, point-in-polygon, distância) | — |
| MapLibre GL JS | Mapa vetorial open source | Biblioteca gratuita, mas tiles precisam de provedor; avaliar PMTiles estático em CDN. |
| Mapbox GL JS | Mapa vetorial comercial | Licença proprietária a partir da v2 e cobrança por carregamento de mapa. |
| Leaflet | Mapa raster leve | — |
| OpenStreetMap | Dados viários e de pontos de interesse | Licença ODbL exige atribuição; tile.openstreetmap.org não pode ser usado como CDN de produção. |
| OSRM | Roteamento rápido (carro, bicicleta, a pé) | Sem transporte público e sem trânsito em tempo real; servidor público de demo não é para produção. |
| GraphHopper | Roteamento com perfis e isócronas | API hospedada é paga acima da cota gratuita; transporte público via GTFS apenas self-hosted. |
| Valhalla | Roteamento multimodal, isócronas, matriz de tempos | Transporte público depende de feeds GTFS disponíveis para a cidade. |
| GeoPandas | Análise geoespacial em Python (pré-processamento offline) | — |
| Shapely | Geometria em Python | — |
| NetworkX | Grafos e caminhos mínimos em Python | — |

#### Conexões com projetos aplicados

Só demonstrar depois de analisar os repositórios e os requisitos reais.

- **MEMORA:** Geographic Memory, Location-Based Retrieval, Spatial Knowledge Graphs, Temporal Location Tracking, Geographic Event Clustering, Contextual Memory Retrieval.
- **Projetos de matching e oportunidades:** Geospatial Matching, Vacancy & Candidate Matching, Route Optimization, Geographic Recommendation, Regional Demand Analysis, Multi-Criteria Ranking, Candidate Distribution Optimization.

---

## 3. Spatial Simulation & Location Intelligence

Combina mapas, agentes autônomos e simulações para estudar movimento, demanda e alocação de recursos no espaço.

### 3.1 Spatial Simulation

_Área: Concepts Lab_

Tópicos: Population Movement Simulation · Urban Mobility Simulation · Geographic Agent Simulation · Traffic Flow Simulation · Pedestrian Simulation · Delivery Route Optimization · Emergency Response Optimization · Resource Allocation · Territory Expansion · Regional Demand Prediction · Location-Based Recommendation · Geographic Demand Forecasting · Dynamic Service Areas · Multi-Agent Routing · Spatial Network Analysis

Experimentos:

- ⬜ **Living Geographic World** (navegador) — Mapa com agentes que se movimentam, têm destinos, procuram recursos, seguem rotas e reagem ao ambiente. Ajuste quantidade, velocidade, destinos, obstáculos, regiões, pontos de interesse, regras de deslocamento e recursos.

#### Tecnologias candidatas: Jogos e simulação

Avaliar cobertura, licença, disponibilidade e custo antes de escolher; não assumir que são gratuitas ou que têm dados de trânsito e transporte público.

| Tecnologia | Uso | Ponto de atenção |
|---|---|---|
| Three.js | Renderização 3D no navegador | — |
| Phaser | Framework de jogos 2D no navegador | — |
| PettingZoo | Ambientes multiagente (AEC e paralelo) | — |

#### Tecnologias candidatas: Geoespacial

Avaliar cobertura, licença, disponibilidade e custo antes de escolher; não assumir que são gratuitas ou que têm dados de trânsito e transporte público.

| Tecnologia | Uso | Ponto de atenção |
|---|---|---|
| H3 | Indexação hexagonal hierárquica (h3-js no navegador) | — |
| Turf.js | Operações geométricas no navegador (buffer, point-in-polygon, distância) | — |
| MapLibre GL JS | Mapa vetorial open source | Biblioteca gratuita, mas tiles precisam de provedor; avaliar PMTiles estático em CDN. |
| NetworkX | Grafos e caminhos mínimos em Python | — |

---

## 4. Mobile Apps, Release & Observability

Do código ao app publicado e monitorado: desenvolvimento mobile, pipeline de build e assinatura, publicação na Play Store com rollout gradual e observabilidade de ponta a ponta (logs, métricas, traces e crashes).

### 4.1 Mobile App Development

_Área: Engineering Playground_

Tópicos: React Native · Expo · Flutter · Kotlin & Jetpack Compose · Offline-First · Local Storage & Sync · Conflict Resolution · Push Notifications · Deep Links · App Permissions · Background Tasks · Mobile Performance · Mobile Accessibility · Location Services · Mobile Security

Experimentos:

- ⬜ **NEXUS Mobile** (navegador) — App companheiro do portfólio, offline-first, que reaproveita experimentos do navegador e serve de cobaia para os laboratórios de release e observabilidade.
- ⬜ **Sincronização offline** (navegador) — Dois dispositivos editam dados sem conexão e sincronizam depois; compara last-write-wins, merge por campo e CRDTs.

### 4.2 Build, Release & Play Store Deploy

_Área: Engineering Playground_

Tópicos: Mobile CI/CD · Android App Bundle (AAB) · Code Signing · Play App Signing · Versioning · Play Console Tracks (Internal, Closed, Open, Production) · Staged Rollouts · Rollback Strategy · Over-the-Air Updates · Feature Flags · Store Listing & Policies · Pre-Launch Reports · App Store (iOS) · Release Automation · Fastlane · EAS Build

Experimentos:

- ⬜ **Pipeline de release visual** (navegador) — Do commit à Play Store: build, testes, assinatura, trilha interna, rollout gradual e rollback, com cada etapa visível e seus tempos.
- ⬜ **Simulador de rollout gradual** (navegador) — Libera uma versão para 1%, 5%, 20%… dos usuários; um bug injetado aparece na taxa de crashes e o visitante decide avançar, pausar ou reverter.

### 4.3 Observability & Reliability

_Área: Engineering Playground_

Tópicos: Structured Logging · Metrics · Distributed Tracing · OpenTelemetry · Crash Reporting · Real User Monitoring · SLI / SLO · Error Budgets · Alerting · Dashboards · Sampling Strategies · Log Aggregation · Incident Response · Chaos Engineering · Health Checks · Cost of Telemetry

Experimentos:

- ⬜ **Observability playground** (navegador) — Microsserviços simulados emitem logs, métricas e traces; o visitante injeta latência, erros e falhas e investiga a causa pelos sinais.
- ⬜ **SLO e error budget** (navegador) — Define um SLO, observa o consumo do error budget sob incidentes e compara alertas por limiar com alertas por burn rate.

#### Tecnologias candidatas: Mobile, release e observabilidade

Avaliar cobertura, licença, disponibilidade e custo antes de escolher; não assumir que são gratuitas ou que têm dados de trânsito e transporte público.

| Tecnologia | Uso | Ponto de atenção |
|---|---|---|
| React Native + Expo | App multiplataforma reaproveitando TypeScript do site | EAS Build tem cota gratuita limitada; build local ou GitHub Actions evita custo. |
| Flutter | App multiplataforma com renderização própria | — |
| Kotlin + Jetpack Compose | Android nativo | — |
| Fastlane | Automação de build, assinatura e upload para as lojas | — |
| Google Play Console | Publicação, trilhas de teste e rollout gradual | Taxa única de registro de desenvolvedor; contas pessoais novas exigem teste fechado com testadores antes da produção. |
| Apple App Store | Publicação iOS | Anuidade do Apple Developer Program e build exigem macOS; fora do escopo inicial. |
| OpenTelemetry | Padrão aberto de logs, métricas e traces | — |
| Firebase Crashlytics | Relatório de crashes mobile | Gratuito, mas envia dados ao Google; declarar na política de privacidade. |
| Sentry | Erros e performance (web e mobile) | Plano gratuito com cota mensal de eventos. |
| Grafana Cloud | Dashboards, Prometheus, Loki e Tempo hospedados | Plano gratuito com limites de séries, logs e retenção. |
| Google Cloud Logging / Monitoring | Telemetria nativa do Cloud Run | Cota gratuita mensal de ingestão; logs verbosos geram custo. |

---

## 5. Scalable Systems & Data-Intensive Applications

Como sistemas aguentam escala: problemas clássicos de system design (como a timeline do Twitter), cache, motores de busca e os fundamentos de Designing Data-Intensive Applications — armazenamento, replicação, particionamento, transações, consenso e processamento de streams — todos simulados e visualizados.

### 5.1 System Design Classics

_Área: Engineering Playground_

Tópicos: Twitter Timeline Problem · Fan-Out on Write · Fan-Out on Read · Celebrity Problem · Hybrid Fan-Out · News Feed · URL Shortener · Rate Limiter · Unique ID Generation (Snowflake) · Chat System · Notification System · Leaderboard · Web Crawler · Load Balancing · Back-of-the-Envelope Estimation

Experimentos:

- ⬜ **O problema da timeline do Twitter** (navegador) — Simula publicações e leituras com seguidores em lei de potência; compara fan-out na escrita, na leitura e híbrido, incluindo contas de celebridades.
- ⬜ **Rate limiters** (navegador) — Token bucket, leaky bucket, janela fixa e janela deslizante sob o mesmo tráfego em rajadas.

### 5.2 Caching

_Área: Engineering Playground_

Tópicos: Cache-Aside · Read-Through · Write-Through · Write-Back · LRU · LFU · TTL · Cache Invalidation · Cache Stampede / Thundering Herd · Request Coalescing · Hot Keys · Consistent Hashing · Multi-Level Cache · CDN Caching · Redis · Memcached

Experimentos:

- ⬜ **Simulador de cache** (navegador) — Tráfego configurável contra um banco lento; compara políticas de escrita e de remoção pela taxa de acerto, latência e carga no banco, e provoca um cache stampede.

### 5.3 Search Engines

_Área: Engineering Playground_

Tópicos: Inverted Index · Tokenization · Stemming · TF-IDF · BM25 · Fuzzy Search · Autocomplete (Trie) · Faceted Search · Vector Search · Hybrid Search · Index Sharding · Query Ranking · Relevance Evaluation (Precision, Recall, NDCG) · Typo Tolerance

Experimentos:

- ⬜ **Motor de busca do NEXUS** (navegador) — Busca sobre o próprio conteúdo do site com índice invertido construído no navegador; mostra tokens, postings e a pontuação BM25 de cada resultado.

### 5.4 Designing Data-Intensive Applications

_Área: Engineering Playground_

Os conceitos do livro de Martin Kleppmann transformados em simulações.

Tópicos: Reliability, Scalability, Maintainability · Data Models · LSM-Tree vs. B-Tree · SSTables & Compaction · Encoding & Schema Evolution · Leader-Follower Replication · Multi-Leader Replication · Leaderless Replication · Quorums · Replication Lag · Partitioning & Rebalancing · Secondary Indexes · Isolation Levels · Write Skew & Lost Updates · MVCC · Clocks & Ordering · Fencing Tokens · Linearizability · Raft · Two-Phase Commit · Batch Processing · Stream Processing · Change Data Capture · Event Sourcing · Exactly-Once Semantics

Experimentos:

- ⬜ **LSM-Tree vs. B-Tree** (navegador) — Escritas e leituras animadas nos dois motores, com amplificação de escrita, compaction e custo de leitura medidos.
- ⬜ **Replicação, quóruns e partições de rede** (navegador) — Ajuste N, W e R, derrube nós e particione a rede; veja leituras desatualizadas, conflitos e disponibilidade.
- ⬜ **Consenso com Raft** (navegador) — Eleição de líder, replicação do log e recuperação de falhas passo a passo.
- ⬜ **Níveis de isolamento** (navegador) — Transações concorrentes reproduzem dirty read, lost update e write skew sob cada nível de isolamento.

#### Tecnologias candidatas: Sistemas escaláveis

Avaliar cobertura, licença, disponibilidade e custo antes de escolher; não assumir que são gratuitas ou que têm dados de trânsito e transporte público.

| Tecnologia | Uso | Ponto de atenção |
|---|---|---|
| Redis / Valkey | Cache, filas e estruturas em memória | Instância gerenciada tem custo fixo; para demos, simular no navegador. |
| Memcached | Cache distribuído simples | — |
| Elasticsearch / OpenSearch | Busca full-text distribuída | Cluster ligado custa caro; usar apenas como referência comparativa. |
| Meilisearch / Typesense | Busca com tolerância a erros, fácil de hospedar | Precisa de servidor; avaliar Cloud Run com índice pequeno. |
| MiniSearch / Lunr / Pagefind | Índice de busca no navegador ou estático no CDN | — |
| pgvector | Busca vetorial no PostgreSQL | — |
| Apache Kafka / Redpanda | Log distribuído para streams e CDC | Infraestrutura pesada; simular o modelo de log no navegador. |
| Debezium | Change Data Capture a partir do log do banco | — |
| SQLite (WASM) | Banco real rodando no navegador para os laboratórios de transação | — |

---

## 6. Data Visualization & Monitoring

Transformar dados e resultados em visualizações que respondem perguntas, e monitorar continuamente métricas, experimentos e modelos para detectar mudanças, anomalias e regressões.

### 6.1 Data Visualization

_Área: Engineering Playground_

Tópicos: Chart Selection · Interactive Dashboards · Time Series · Geospatial Visualization · Large Dataset Rendering · Canvas & WebGL Rendering · Downsampling (LTTB) · Streaming Charts · Linked Views & Brushing · Data Storytelling · Accessible Color Palettes · Uncertainty Visualization · In-Browser Analytics (DuckDB-WASM)

Experimentos:

- ⬜ **Um milhão de pontos** (navegador) — O mesmo conjunto de dados renderizado em SVG, Canvas e WebGL, com e sem downsampling; mede quadros por segundo e fidelidade visual.
- ⬜ **Dataset explorável** (navegador) — Dados públicos consultados com SQL no navegador e visualizações ligadas: filtrar em um gráfico atualiza os demais.

### 6.2 Monitoring Results

_Área: Engineering Playground_

Tópicos: KPIs · Real-Time Monitoring · Anomaly Detection · Alert Thresholds · A/B Testing · Statistical Significance · Experiment Tracking · Model Monitoring · Data Drift · Data Quality Checks · Funnel Analysis · Cohort Analysis · Privacy-Friendly Analytics · Regression Detection

Experimentos:

- ⬜ **Monitor em tempo real com detecção de anomalias** (navegador) — Métricas simuladas em streaming com anomalias injetadas; compara limiar fixo, média móvel/desvio padrão e sazonalidade, contando falsos positivos e negativos.
- ⬜ **Laboratório de testes A/B** (navegador) — Simula variantes com efeitos reais conhecidos; mostra intervalos de confiança, o perigo de espiar o resultado antes da hora e a amostra necessária.
- ⬜ **NEXUS em números** (navegador) — Painel público com o uso dos próprios experimentos do portfólio, coletado com analytics sem cookies.

#### Tecnologias candidatas: Visualização e monitoramento

Avaliar cobertura, licença, disponibilidade e custo antes de escolher; não assumir que são gratuitas ou que têm dados de trânsito e transporte público.

| Tecnologia | Uso | Ponto de atenção |
|---|---|---|
| D3.js | Visualizações sob medida | — |
| Observable Plot | Gráficos exploratórios concisos | — |
| Apache ECharts | Dashboards interativos com Canvas/WebGL | — |
| uPlot | Séries temporais muito rápidas | — |
| deck.gl | Visualização geoespacial em WebGL | — |
| DuckDB-WASM | SQL analítico no navegador sobre Parquet/CSV | — |
| Apache Arrow / Parquet | Formatos colunares para enviar dados ao cliente | — |
| Grafana + Prometheus | Monitoramento de métricas | Self-hosted exige servidor ligado; preferir plano gratuito hospedado. |
| Cloudflare Web Analytics | Analytics sem cookies para o NEXUS em números | Gratuito; dados agregados, sem eventos personalizados detalhados. |
| MLflow | Rastreamento de experimentos de ML | Servidor próprio; usar localmente e publicar apenas resultados estáticos. |

---

## 7. Pipelines, Automation & Agentic Engineering

Como o software é construído, verificado e publicado: pipelines de CI/CD, automações e agentes de IA atuando no fluxo de desenvolvimento (revisão de código, testes, triagem), sempre com resultados medidos e o próprio NEXUS como cobaia.

### 7.1 CI/CD Pipelines

_Área: Engineering Playground_

Tópicos: GitHub Actions · Pipeline as Code · Build Caching · Test Parallelization · Matrix Builds · Preview Deployments · Infrastructure as Code no CI (`tofu plan` em PR) · Supply Chain Security (SBOM, assinatura de imagens, pinning de actions) · Secrets Management · Workload Identity Federation · Deployment Strategies (blue-green, canary) · Rollback · DORA Metrics

Experimentos:

- ⬜ **Pipeline do NEXUS visualizado** (navegador) — Cada etapa do CI/CD real do NEXUS (testes, build, `tofu test`, imagem, deploy) com tempos e histórico de execuções, e métricas DORA calculadas a partir dele.

### 7.2 Agentic Code Review

_Área: Engineering Playground_

Tópicos: AI Code Review · Review Agents · Multi-Agent Review (especialistas por eixo: correção, segurança, padrões) · Spec vs. Implementation Review · Static Analysis + LLM · False Positive Rate · Review Benchmarks · Human-in-the-Loop · Prompt & Context Engineering · Cost per Review

Experimentos:

- ⬜ **Revisor agêntico de PRs** (Cloud Run) — Agente que revisa os PRs do próprio NEXUS e comenta achados; o site mostra cada revisão, os achados aceitos e rejeitados e o custo.
- ⬜ **Benchmark de revisores** (navegador) — Bugs conhecidos injetados em diffs; compara revisores (linters, LLM único, multiagente) por acertos, falsos positivos, tempo e custo.

### 7.3 Automation & Agentic Workflows

_Área: Engineering Playground_

Tópicos: Workflow Automation · Event-Driven Automation · Scheduled Jobs · Agentic Workflows · Tool Use · Task Orchestration · Guardrails & Approvals · Observability of Agents · Evaluation of Agents · Idempotency & Retries

Experimentos:

- ⬜ **Automações do NEXUS** (navegador) — Automações que mantêm o próprio projeto (atualização de dependências, verificação de links, revalidação dos testes do Lab, checagem de custo) com registro público de cada execução e decisão.

### 7.4 LLM no núcleo do site

_Área: Engineering Playground_

Hoje o centro da home é um roteador de intenções: tokeniza a frase, pontua os nós do grafo e aplica softmax. Funciona, é testado e não custa nada, mas não é um modelo de linguagem. O próximo passo troca (ou complementa) o roteador por um LLM, mantendo os mesmos efeitos na cena.

Tópicos: In-Browser Inference (WebGPU) · Small Language Models · Tool Calling (o LLM chama os comandos do terminal) · Structured Output · RAG sobre o próprio site (posts e experimentos) · Prompt Injection · Cost per Answer · Latency vs. Quality

Experimentos:

- ⬜ **LLM de verdade no núcleo** (navegador / Cloud Run) — Duas portas, comparadas ao vivo: modelo pequeno rodando no navegador via WebGPU (opt-in, download grande, custo zero) e modelo via API atrás do Cloud Run (escala a zero, com teto de gasto e rate limit). O modelo responde chamando os mesmos comandos (`path`, `bfs`, `match`…); a cena mostra a atenção real quando o modelo expõe pesos, e os tokens saindo em streaming.

Hipóteses candidatas para o Lab:

- Revisão multiagente encontra mais bugs reais que um único revisor, com custo aceitável?
- Qual taxa de falsos positivos torna um revisor automático ignorado pelos humanos?

#### Tecnologias candidatas: Pipelines e agentes

| Tecnologia | Uso | Ponto de atenção |
|---|---|---|
| GitHub Actions | CI/CD do repositório | Gratuito em repositórios públicos; minutos limitados em privados. |
| OpenTofu (`plan`/`test` no CI) | Infra validada em todo PR | Estado remoto necessário para `plan` real no CI. |
| Workload Identity Federation | Deploy do CI no Google Cloud sem chaves | Configurar via OpenTofu. |
| Claude Code / Agent SDK | Agentes de revisão e automação | Custo por token; limitar escopo e frequência. |
| Renovate / Dependabot | Atualização automática de dependências | Ruído de PRs; agrupar atualizações. |
| Sigstore / cosign | Assinatura de imagens | — |
| Trivy / Grype | Varredura de vulnerabilidades em imagens | — |
