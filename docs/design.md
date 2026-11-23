# Design do NEXUS

Como o site deve parecer, se comportar e por quê. Valores concretos vivem em `src/styles/global.css`; aqui ficam a direção, as regras e as decisões.

## Direção: Leonida ao entardecer

Identidade inspirada no material de divulgação de GTA VI (Vice City, estado de Leonida): noite violeta, pôr do sol rosa e laranja, títulos condensados em caixa alta. É uma homenagem de estética: nenhum logotipo, fonte proprietária, arte ou nome da Rockstar aparece no site.

O conteúdo continua sendo um laboratório aberto: cada tela mostra uma afirmação sendo medida agora, no navegador de quem visita. A identidade muda a roupa, não o princípio: tudo o que aparece é calculado de verdade.

- **Tipo.** TeX Gyre Heros Condensed negrito em caixa alta nos títulos (itálico no h1, na marca, na navegação e nos botões, como os letreiros de pôster); Heros no texto; JetBrains Mono em números, código, rótulos e no console.
- **Cor.** Fundo de noite violeta com o brilho do sol se pondo no topo da página. **Rosa neon** (`--signal`) continua significando “ao vivo, medido agora, sua ação”. **Laranja do sol** (`--sun`) marca rótulos e números de série. Ciano (oceano), violeta (neon) e verde-água (palmeira) codificam o tipo de nó; verde e vermelho só em vereditos.
- **Pôr do sol.** O degradê `--sunset` (amarelo → laranja → rosa → roxo) é a assinatura e aparece só em três lugares: a marca, a segunda linha do título da home e o horizonte listrado acima do rodapé. Em nenhum texto corrido.
- **Composição.** Editorial e assimétrica, como antes: trilho com número de série à esquerda, fios finos separando blocos. Regiões de dado ganham uma borda superior rosa.
- **Movimento.** Só quando um dado chega ou um estado muda. A rede 3D ganhou as cores do entardecer e uma grade polar rosa como horizonte.
- **O que não fazemos.** Logotipo, fonte Pricedown, capturas ou artes do jogo; degradê em texto longo; brilho decorativo em interface de dado; partículas de fundo; cartão dentro de cartão.

## Tokens

Definidos uma vez em `src/styles/global.css`:

| Grupo | Tokens |
|---|---|
| Tinta | `--ink-0` fundo · `--ink-1` região de dado · `--ink-2` elevado (console, cartões da cena) · `--line` · `--line-strong` |
| Texto | `--text` (18,0:1 sobre o fundo) · `--text-2` (12,7:1) · `--text-3` (7,6:1; pior caso 6,5:1 sobre `--ink-2`) |
| Sinal e semântica | `--signal` rosa (5,9:1) + `--signal-ink` (5,9:1 sobre o rosa) · `--sun` laranja (10,8:1) · `--sunset` / `--sunset-h` · `.sunset-text` · `--ok` · `--bad` · `--info` · `--kind-section` · `--kind-test` · `--kind-project` |
| Tipo | `--font-display` · `--font-body` · `--font-mono` · escala `--t-xs` … `--t-display` (display limitado por largura **e** altura) |
| Espaço | `--s-1` (0,25 rem) … `--s-9` (7 rem) · `--gutter` · `--max` 1280 px · `--rail` (coluna do número de série) |
| Forma e alvo | `--radius` 2 px · `--hit` 44 px (alvo de toque mínimo abaixo de 720 px) |
| Camadas | `--z-overlay` · `--z-header` · `--z-float` · `--z-dialog` · `--z-toast` |
| Movimento | `--ease` · `--d-fast` 120 ms · `--d-med` 220 ms · `--d-slow` 420 ms |
| Quebras | 480 · 720 · 1024 · 1280 (CSS não aceita variável em `@media`; usar só estes valores) |

Contrastes medidos com a fórmula WCAG para cada par texto × superfície; todos passam AA para texto normal.

Fontes: subconjuntos locais em `public/fonts/` (≈84 KB no total, `font-display: swap`, duas pré-carregadas). Licenças em `public/fonts/LICENSES.md`.

## Composição por tipo de página

- **Home.** A rede ocupa a primeira tela. Desktop: título e ações à esquerda, a rede deslocada para a direita pela própria câmera (`setViewOffset`), leitura da cena no topo direito (só com altura sobrando) e console no canto inferior direito. Abaixo de 1024 px empilha: texto → rede → console, sem nada sobre a rede. Abaixo da dobra: lista de hipóteses (linhas, não cartões) e o projeto com um retrato real do sistema calculado no build.
- **Abertura de seção.** Trilho com número e nome; título em display; uma frase; perguntas prontas para o núcleo.
- **Teste do Lab.** Ficha: número no trilho, hipótese em display, carimbo do veredito, gráfico desenhado na largura real do contêiner, estatísticas em mono, controles, regra e link do código no rodapé.
- **Projeto.** O sistema roda direto na página, com a documentação (como funciona, implementação, limitações) recolhida abaixo, em coluna de leitura de ~70 caracteres. Os títulos dos painéis seguem a página (h2 quando o projeto é a página, h3 quando está embutido em /projetos; ver `heading.tsx`).
- **Mapas interativos.** Uma só parada de Tab; setas percorrem os pontos em ordem de leitura, Enter seleciona; cada ponto tem área de toque invisível maior que o desenho e nome legível por leitor de tela.
- **Rodapé.** O painel de transparência fica fechado numa linha; aberto, vira uma ficha técnica.

## Movimento

- Respostas a ações em menos de 100 ms; efeitos longos nunca bloqueiam (onda de BFS e caminho usam relógio próprio).
- Entradas: 120–220 ms, `--ease`. Sem rebote, sem movimento que não diga algo.
- `prefers-reduced-motion`: sem rotação, sem agentes, respostas escritas de uma vez e todas as transições CSS zeradas no global.
- Rede: botão “pausar” no console; renderização pausa fora da tela e com a aba oculta.

## Princípios

1. **Mostrar antes de explicar.** A primeira tela é algo para mexer, não um parágrafo. Texto aparece sob demanda (*cognitive gate*, Nicky Case): quem ficou curioso abre a explicação.
2. **Toda interação é real.** Clicar num nó roda uma busca em largura de verdade; um comando no terminal executa o mesmo código dos experimentos. Nada de animação fingindo ser algoritmo.
3. **Juice com significado.** Cada efeito responde “o que isso está dizendo?”: a onda do BFS mostra camadas de distância, o caminho aceso mostra o Dijkstra. Ações grandes têm efeito grande, ações pequenas têm efeito pequeno. Sem shake gratuito.
4. **Resposta em menos de 100 ms.** Hover, clique e tecla têm retorno imediato; efeitos longos nunca atrasam a ação.
5. **Duas portas para tudo.** Quem gosta de digitar usa o terminal; quem não gosta clica nos nós ou nos atalhos. No celular, comandos viram botões.
6. **Progresso e descoberta.** Conquistas leves (primeiro BFS, primeiro caminho mínimo, rodar o matching…) convidam a explorar sem bloquear nada.
7. **Sandbox no fim.** Seguindo Nicky Case, a experiência termina com liberdade total: o terminal aceita qualquer combinação de comandos.
8. **Não sequestrar o navegador.** Rolagem continua sendo rolagem; zoom da cena não captura a roda do mouse; links continuam sendo links.
9. **Respeito ao visitante.** `prefers-reduced-motion` desliga rotação e animações longas; há botão de pausa; sem som automático; sem WebGL, o site continua usável.
10. **Leve.** Three.js só carrega na home e depois da página pronta; pixel ratio limitado a 2; um draw call por tipo de objeto (InstancedMesh); renderização pausa fora da tela ou com a aba oculta; recursos da GPU liberados ao sair.


## Decisões rejeitadas

| Ideia | Por que não |
|---|---|
| Manter a estética HUD neon (cantoneiras, varredura, gradientes, brilhos) | Genérica: é o visual padrão de “site de IA”; o brilho competia com os dados |
| “Bancada de medição” (preto neutro, âmbar, Adventor) | Substituída em nov/2026 pela identidade de entardecer inspirada em GTA VI, a pedido; regras de dado e acessibilidade mantidas |
| Usar a fonte Pricedown, o logotipo ou artes de GTA | Marca e direitos de terceiros; a homenagem fica na paleta, no tipo condensado e no horizonte |
| Fundo de partículas 2D nas páginas internas | Decoração sem significado; custo de CPU contínuo sem informação |
| Botão flutuante “pergunte ao núcleo” e painel de entrega flutuante | Dois elementos fixos disputando o canto inferior e cobrindo conteúdo; viraram botão no cabeçalho e linha no rodapé |
| Ilustração desenhada à mão para o projeto na home | Pontos inventados; substituída por um retrato do cenário real |
| Inter / fonte do sistema | Escolha padrão de qualquer template; a Heros Condensed dá o letreiro de pôster sem custo de licença |
| Nova dependência para capturar telas (Playwright) | Exigiria download; a validação usa o Chrome já instalado via DevTools Protocol |

## Referências

### Portfólios e sites 3D

- **Bruno Simon** — portfólio em que se dirige um carrinho num mundo 3D com física para encontrar os projetos. O mais citado entre devs; Site of the Month no Awwwards (jan/2026). Lição: o portfólio *é* a demonstração de habilidade, e explorar no próprio ritmo prende mais que ler. [bruno-simon.com](https://bruno-simon.com)
- **Awwwards — galeria Three.js**, para acompanhar o que está sendo premiado. [awwwards.com/websites/three-js](https://www.awwwards.com/websites/three-js/)
- **Lacoste Ace Breaker** — arcade em Three.js, Site of the Month (abr/2026): um minijogo como porta de entrada. Listado em [utsubo.com/blog/best-threejs-websites-2026](https://www.utsubo.com/blog/best-threejs-websites-2026).
- **Equinox (Little Workshop)** — narrativa espacial que aposta em atmosfera e ritmo, não em espetáculo. Mesma lista.
- Listas de portfólios: [creativedevjobs.com](https://www.creativedevjobs.com/blog/best-threejs-portfolio-examples-2025), [webdesignawards.io](https://www.webdesignawards.io/technology/three-js), tópico [3d-portfolio no GitHub](https://github.com/topics/3d-portfolio).

### Game feel e “juice”

- **“Juice it or lose it”** (Jonasson e Purho, GDC 2012): um Breakout sem graça vira divertido só com tweens, partículas, flash, shake e som. **Juice** = dar muito mais retorno do que a entrada merece.
- **“The Art of Screenshake”** (Jan Willem Nijman, 2013) e **Game Feel** (Steve Swink, 2008): responsividade e legibilidade vêm antes do enfeite.
- Juice em interfaces: [Brad Woods — Juice](https://garden.bradwoods.io/notes/design/juice), [Game feel on the web](https://valdemird.com/blog/game-feel-on-the-web/).

### Explicações exploráveis

- **Bret Victor** — *Explorable Explanations* (2011), *Up and Down the Ladder of Abstraction*: o leitor manipula o modelo em vez de só ler sobre ele.
- **Nicky Case** — *Parable of the Polygons*, *The Evolution of Trust*, e os posts *Design patterns for explorable explanations* em [blog.ncase.me](https://blog.ncase.me). Lista curada: [awesome-explorables](https://github.com/blob42/awesome-explorables).

### Performance e acessibilidade em 3D

- [100 Three.js tips (Utsubo)](https://www.utsubo.com/blog/threejs-best-practices-100-tips), [Three.js performance checklist](https://threejsdemos.com/docs/performance).
- [Respecting users’ motion preferences (Smashing)](https://www.smashingmagazine.com/2021/10/respecting-users-motion-preferences/).


## Validação

Telas de antes e depois ficam em `.shots/` (fora do git). Larguras validadas: 1440, 1280, 768 e 390 px, com interações dirigidas pelo DevTools Protocol (Ctrl+K, “/”, perguntas, clique em nó, sliders, mapa, Esc e retorno de foco), sem WebGL e com movimento reduzido.

## Ideias para depois

- Transições entre páginas (View Transitions) com a câmera “voando” para o experimento.
- Som opcional, desligado por padrão, com botão visível.
- Cada experimento com um “modo jogo”: desafio com objetivo (ex.: “encontre pesos em que o Hungarian fique estável”).
- Miniaturas vivas dos experimentos nos cards, renderizadas só quando visíveis.
