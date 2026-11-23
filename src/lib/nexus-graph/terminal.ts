/**
 * Terminal da home: interpreta comandos e devolve texto + efeitos para a cena.
 * Não toca em DOM nem em WebGL, para poder ser testado e funcionar sem 3D.
 */
import { runMatching } from '../matching/api';
import { makeScenario } from '../matching/data';
import { bfsLayers, findNode, pathLength, shortestPath, type Graph } from './graph';
import { interpret, type Attention } from './intent';

export type Effect =
  | { type: 'pulse'; node: number; layers: number[][] }
  | { type: 'think'; attention: Attention[] }
  | { type: 'path'; path: number[] }
  | { type: 'focus'; node: number }
  | { type: 'navigate'; href: string }
  | { type: 'agents'; count: number }
  | { type: 'speed'; value: number }
  | { type: 'pause'; paused: boolean }
  | { type: 'stats' }
  | { type: 'clear' }
  | { type: 'achievement'; id: AchievementId };

export interface Line {
  text: string;
  tone?: 'muted' | 'ok' | 'warn' | 'error' | 'accent';
  /** Linha clicável que executa este comando. */
  run?: string;
  /** Linha que é um link (usada fora da home para levar o comando até a cena). */
  href?: string;
}

export interface Result {
  lines: Line[];
  effects: Effect[];
}

export const ACHIEVEMENTS = {
  bfs: { title: 'Primeira onda', hint: 'dispare uma busca em largura' },
  path: { title: 'Caminho mínimo', hint: 'encontre um caminho entre dois nós' },
  match: { title: 'Matchmaker', hint: 'rode o algoritmo de matching' },
  swarm: { title: 'Enxame', hint: 'solte 200 agentes ou mais' },
  explorer: { title: 'Explorador', hint: 'clique em 5 nós diferentes' },
  ask: { title: 'Conversa com o núcleo', hint: 'escreva uma pergunta em vez de um comando' },
  sudo: { title: 'Curioso', hint: 'tente ser root' },
} as const;
export type AchievementId = keyof typeof ACHIEVEMENTS;

export interface TerminalContext {
  name: string;
  unlocked: readonly AchievementId[];
}

interface Command {
  name: string;
  usage: string;
  summary: string;
  run: (args: string[], g: Graph, ctx: TerminalContext) => Result;
}

const out = (lines: Line[], effects: Effect[] = []): Result => ({ lines, effects });
const err = (text: string): Result => out([{ text, tone: 'error' }]);
const nameOf = (g: Graph, i: number) => g.nodes[i].label ?? `#${g.nodes[i].id}`;

function resolve(g: Graph, query: string | undefined): number | string {
  if (!query) return 'informe um nó (use ls para ver os nomes)';
  // #id endereça qualquer nó, inclusive os sem rótulo (clicados na cena).
  const i = query.startsWith('#') ? g.nodes.findIndex((n) => n.id === query.slice(1)) : findNode(g, query);
  return i === -1 ? `nó não encontrado: ${query}` : i;
}

const COMMANDS: Command[] = [
  {
    name: 'help',
    usage: 'help',
    summary: 'lista os comandos',
    run: () =>
      out([
        { text: 'comandos disponíveis:', tone: 'muted' },
        ...COMMANDS.map((c) => ({ text: `${c.usage.padEnd(22)} ${c.summary}`, run: c.usage.includes(' ') ? undefined : c.name })),
        { text: 'ou escreva uma frase: “caminho do lab até vagas”, “rode o matching”', tone: 'muted' },
        { text: 'tab completa · ↑↓ histórico · clique num nó para disparar uma onda', tone: 'muted' },
      ]),
  },
  {
    name: 'ask',
    usage: 'ask <pergunta>',
    summary: 'pergunta em linguagem natural ao núcleo',
    run: (args, g, ctx) => ask(args.join(' '), g, ctx),
  },
  {
    name: 'ls',
    usage: 'ls',
    summary: 'mostra as partes do site',
    run: (_, g) => {
      const lines: Line[] = [];
      g.nodes.forEach((n, i) => {
        if (n.kind === 'section') {
          lines.push({ text: `${n.label}/`, tone: 'accent', run: `open ${n.id}` });
          for (const j of g.adjacency[i]) {
            const child = g.nodes[j];
            if (child.kind === 'experiment' || child.kind === 'project') lines.push({ text: `  ${child.label}`, run: `open ${child.id}` });
          }
        }
      });
      return out(lines);
    },
  },
  {
    name: 'open',
    usage: 'open <nó>',
    summary: 'voa até o nó e abre a página',
    run: ([q], g) => {
      const i = resolve(g, q);
      if (typeof i === 'string') return err(i);
      const href = g.nodes[i].href;
      if (!href) return err(`${nameOf(g, i)} não tem página`);
      return out([{ text: `abrindo ${nameOf(g, i)}…`, tone: 'ok' }], [{ type: 'focus', node: i }, { type: 'navigate', href }]);
    },
  },
  {
    name: 'bfs',
    usage: 'bfs [nó]',
    summary: 'busca em largura a partir de um nó',
    run: ([q], g) => {
      const i = q ? resolve(g, q) : 0;
      if (typeof i === 'string') return err(i);
      const start = performance.now();
      const layers = bfsLayers(g, i);
      const ms = performance.now() - start;
      const reached = layers.reduce((s, l) => s + l.length, 0);
      return out(
        [
          { text: `bfs a partir de ${nameOf(g, i)}: ${reached} nós em ${layers.length - 1} camadas (${ms.toFixed(2)} ms)`, tone: 'ok' },
          { text: `camadas: ${layers.map((l) => l.length).join(' → ')}`, tone: 'muted' },
        ],
        [{ type: 'pulse', node: i, layers }, { type: 'achievement', id: 'bfs' }],
      );
    },
  },
  {
    name: 'path',
    usage: 'path <a> <b>',
    summary: 'caminho mínimo (Dijkstra) entre dois nós',
    run: ([qa, qb], g) => {
      const a = resolve(g, qa);
      if (typeof a === 'string') return err(a);
      const b = resolve(g, qb);
      if (typeof b === 'string') return err(b);
      const path = shortestPath(g, a, b);
      if (path.length === 0) return err('sem caminho');
      return out(
        [
          { text: `dijkstra ${nameOf(g, a)} → ${nameOf(g, b)}: ${path.length - 1} arestas, comprimento ${pathLength(g, path).toFixed(1)}`, tone: 'ok' },
          { text: path.map((i) => nameOf(g, i)).join(' → '), tone: 'muted' },
        ],
        [{ type: 'path', path }, { type: 'achievement', id: 'path' }],
      );
    },
  },
  {
    name: 'match',
    usage: 'match [seed]',
    summary: 'roda o matching de vagas aqui no navegador',
    run: ([seedArg]) => {
      const seed = seedArg ? Number(seedArg) : 7;
      if (!Number.isInteger(seed) || seed < 1) return err('seed precisa ser um inteiro positivo');
      const start = performance.now();
      const results = runMatching({
        ...makeScenario(seed, 12, 40),
        weights: { geo: 3, professional: 3, education: 2, schedule: 1, preferences: 1 },
        constraints: { modality: true, course: true, schedule: true, commute: true, fares: true },
      });
      const ms = performance.now() - start;
      const row = (label: string, k: keyof typeof results) => {
        const m = results[k].metrics;
        return { text: `${label.padEnd(13)} ${String(m.pairs).padStart(2)} pares · score ${m.totalScore.toFixed(2)} · ${m.blockingPairs} bloqueantes` };
      };
      return out(
        [
          { text: `seed ${seed}: 12 vagas, 40 candidatos — calculado no seu navegador em ${ms.toFixed(1)} ms`, tone: 'ok' },
          row('greedy', 'greedy'),
          row('hungarian', 'hungarian'),
          row('gale-shapley', 'stable'),
          { text: 'ver o experimento completo', tone: 'accent', run: 'open vacancy-matching' },
        ],
        [{ type: 'achievement', id: 'match' }],
      );
    },
  },
  {
    name: 'agents',
    usage: 'agents <n>',
    summary: 'agentes viajando pelas arestas (0–600)',
    run: ([n]) => {
      const count = Number(n);
      if (!Number.isInteger(count) || count < 0 || count > 600) return err('use um número entre 0 e 600');
      const effects: Effect[] = [{ type: 'agents', count }];
      if (count >= 200) effects.push({ type: 'achievement', id: 'swarm' });
      return out([{ text: `${count} agentes na rede`, tone: 'ok' }], effects);
    },
  },
  {
    name: 'speed',
    usage: 'speed <x>',
    summary: 'velocidade da simulação (0.1–5)',
    run: ([v]) => {
      const value = Number(v);
      if (!Number.isFinite(value) || value < 0.1 || value > 5) return err('use um valor entre 0.1 e 5');
      return out([{ text: `velocidade ${value}×`, tone: 'ok' }], [{ type: 'speed', value }]);
    },
  },
  {
    name: 'pause',
    usage: 'pause',
    summary: 'pausa a animação',
    run: () => out([{ text: 'pausado', tone: 'muted' }], [{ type: 'pause', paused: true }]),
  },
  {
    name: 'play',
    usage: 'play',
    summary: 'retoma a animação',
    run: () => out([{ text: 'rodando', tone: 'muted' }], [{ type: 'pause', paused: false }]),
  },
  {
    name: 'stats',
    usage: 'stats',
    summary: 'fps, draw calls e tamanho do grafo',
    run: (_, g) => out([{ text: `grafo: ${g.nodes.length} nós, ${g.edges.length} arestas`, tone: 'muted' }], [{ type: 'stats' }]),
  },
  {
    name: 'whoami',
    usage: 'whoami',
    summary: 'quem fez isto',
    run: (_, __, ctx) =>
      out([
        { text: ctx.name, tone: 'accent' },
        { text: 'testes de hipóteses · projetos rodando', tone: 'muted' },
        { text: 'ver os testes do lab', run: 'open lab' },
      ]),
  },
  {
    name: 'achievements',
    usage: 'achievements',
    summary: 'conquistas desbloqueadas',
    run: (_, __, ctx) => {
      const ids = Object.keys(ACHIEVEMENTS) as AchievementId[];
      return out([
        { text: `${ctx.unlocked.length}/${ids.length} conquistas`, tone: 'accent' },
        ...ids.map((id) =>
          ctx.unlocked.includes(id)
            ? { text: `★ ${ACHIEVEMENTS[id].title}`, tone: 'ok' as const }
            : { text: `☆ ??? — ${ACHIEVEMENTS[id].hint}`, tone: 'muted' as const },
        ),
      ]);
    },
  },
  {
    name: 'clear',
    usage: 'clear',
    summary: 'limpa o terminal',
    run: () => out([], [{ type: 'clear' }]),
  },
];

export const COMMAND_NAMES = COMMANDS.map((c) => c.name);

export function execute(input: string, g: Graph, ctx: TerminalContext): Result {
  const [name, ...args] = input.trim().split(/\s+/);
  if (!name) return out([]);
  if (name === 'sudo') {
    return out(
      [
        { text: `[sudo] senha para visitante: ********`, tone: 'muted' },
        { text: 'permissão negada: aqui todo mundo é visitante, e o servidor só faz uma coisa.', tone: 'warn' },
      ],
      [{ type: 'achievement', id: 'sudo' }],
    );
  }
  const cmd = COMMANDS.find((c) => c.name === name.toLowerCase());
  if (cmd) return cmd.run(args, g, ctx);
  // Uma palavra desconhecida é quase sempre erro de digitação; uma frase vai para o núcleo.
  if (args.length === 0 && interpret(input, g).confidence === 0) {
    const guess = COMMAND_NAMES.find((c) => c.startsWith(name.toLowerCase().slice(0, 2)));
    return out([
      { text: `comando não encontrado: ${name}`, tone: 'error' },
      guess ? { text: `quis dizer ${guess}?`, tone: 'muted', run: guess } : { text: 'digite help ou escreva uma pergunta', tone: 'muted', run: 'help' },
    ]);
  }
  return ask(input, g, ctx);
}

const bar = (w: number) => '█'.repeat(Math.round(w * 12)).padEnd(12, '·');

/** Pergunta em linguagem natural: mostra a interpretação e executa o comando equivalente. */
function ask(question: string, g: Graph, ctx: TerminalContext): Result {
  const q = interpret(question, g);
  if (q.tokens.length === 0) return err('escreva uma pergunta: ask como funciona o site?');
  const lines: Line[] = [
    { text: `tokens  ${q.tokens.map((t) => `[${t}]`).join(' ')}`, tone: 'muted' },
    ...q.attention.slice(0, 3).map((a) => ({
      text: `atenção ${bar(a.weight)} ${a.weight.toFixed(2)}  ${nameOf(g, a.node)}`,
      tone: 'accent' as const,
    })),
  ];
  const effects: Effect[] = [{ type: 'achievement', id: 'ask' }];
  if (q.attention.length) effects.unshift({ type: 'think', attention: q.attention });

  if (q.command) {
    lines.push({ text: `intenção ${q.intent} → ${q.command}  (confiança ${q.confidence.toFixed(2)})`, tone: 'ok' });
    const result = execute(q.command, g, ctx);
    return out([...lines, ...result.lines], [...effects, ...result.effects]);
  }
  const top = q.attention[0];
  if (!top) {
    return out([
      ...lines,
      { text: 'não reconheci nada desta rede na frase. experimente:', tone: 'warn' },
      { text: '  o que tem aqui?', run: 'o que tem aqui?' },
      { text: '  caminho do lab até vagas', run: 'caminho do lab até vagas' },
      { text: '  rode o matching', run: 'rode o matching' },
    ]);
  }
  const node = g.nodes[top.node];
  lines.push({ text: `${node.label}: ${node.summary ?? 'sem descrição'}` });
  if (node.href) lines.push({ text: `abrir ${node.label} →`, tone: 'accent', run: `open ${node.id}` });
  lines.push({ text: `ver o caminho do núcleo até ${node.label}`, tone: 'muted', run: `path nexus ${node.id}` });
  return out(lines, effects);
}

/** Autocompletar: nome do comando no primeiro termo, nome de nó nos demais. */
export function complete(input: string, g: Graph): string {
  const parts = input.split(' ');
  const last = parts[parts.length - 1].toLowerCase();
  if (!last) return input;
  const pool = parts.length === 1 ? COMMAND_NAMES : g.nodes.filter((n) => n.label).map((n) => n.id);
  const matches = pool.filter((p) => p.toLowerCase().startsWith(last));
  if (matches.length === 0) return input;
  // Completa até o maior prefixo comum.
  let prefix = matches[0];
  for (const m of matches) while (!m.toLowerCase().startsWith(prefix.toLowerCase())) prefix = prefix.slice(0, -1);
  parts[parts.length - 1] = matches.length === 1 ? `${matches[0]} ` : prefix;
  return parts.join(' ');
}
