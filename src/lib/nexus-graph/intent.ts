/**
 * Núcleo de linguagem do terminal: transforma uma frase em comando.
 *
 * Não é um LLM. É um roteador de intenções determinístico que roda no navegador:
 * pontua cada nó do grafo pelas palavras da frase e aplica softmax para obter a
 * "atenção" que a cena desenha. Os pesos mostrados são os calculados aqui, não uma
 * animação decorativa. Um modelo de linguagem de verdade é um item do roadmap.
 */
import type { Graph } from './graph';

export interface Attention {
  node: number;
  weight: number;
}

export interface Interpretation {
  tokens: string[];
  /** Nós mais relevantes, em ordem de peso (softmax sobre os rotulados com pontuação > 0). */
  attention: Attention[];
  intent: IntentId | null;
  /** Comando equivalente, ou null quando a frase só menciona um nó (o núcleo o descreve). */
  command: string | null;
  confidence: number;
}

export type IntentId =
  | 'path' | 'bfs' | 'match' | 'open' | 'agents' | 'speed' | 'pause' | 'play'
  | 'stats' | 'whoami' | 'ls' | 'achievements' | 'help';

const STOPWORDS = new Set(
  'o a os as um uma uns umas de do da dos das e em no na nos nas para pra pro por com que qual quais me mim eu voce isso isto esse essa este esta sobre ao aos se mais muito meu minha seu sua the of and to is'.split(' '),
);

// Padrões com até 3 letras precisam ser a palavra inteira; os maiores valem como prefixo.
const INTENTS: { id: IntentId; patterns: string[] }[] = [
  { id: 'path', patterns: ['caminho', 'rota', 'ligar', 'liga', 'conect', 'dijkstra', 'entre', 'path'] },
  { id: 'bfs', patterns: ['bfs', 'onda', 'busca', 'largura', 'vizinh', 'explor', 'espalh', 'propag'] },
  { id: 'match', patterns: ['match', 'rode', 'rodar', 'roda', 'execut', 'calcul', 'simul', 'aloc', 'combin'] },
  { id: 'agents', patterns: ['agente', 'enxame', 'swarm', 'particul'] },
  { id: 'speed', patterns: ['velocid', 'rapid', 'acelera', 'devagar', 'lento', 'lenta'] },
  { id: 'pause', patterns: ['pausa', 'pause', 'parar', 'para', 'congel'] },
  { id: 'play', patterns: ['continu', 'retom', 'play', 'solta'] },
  { id: 'stats', patterns: ['fps', 'desempenho', 'performance', 'estatist', 'metrica', 'stats'] },
  { id: 'whoami', patterns: ['quem', 'autor', 'criou', 'dono', 'whoami'] },
  { id: 'achievements', patterns: ['conquist', 'trofeu', 'premio', 'achievement'] },
  { id: 'help', patterns: ['ajuda', 'help', 'comando', 'socorro'] },
  { id: 'ls', patterns: ['lista', 'listar', 'tudo', 'mapa', 'conteudo', 'tem', 'secoes', 'indice', 'ls'] },
  { id: 'open', patterns: ['abr', 'abra', 'abrir', 'ir', 'vai', 'va', 'leve', 'levar', 'mostr', 'ver', 'naveg', 'acess', 'entr', 'open'] },
];

/** Intenções que precisam de um nó como alvo. */
const NEEDS_NODE = new Set<IntentId>(['open']);

export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

const hit = (token: string, pattern: string) => (pattern.length <= 3 ? token === pattern : token.startsWith(pattern));

// Radical simples: as 5 primeiras letras bastam para "vagas"/"vaga", "algoritmos"/"algoritmo".
const stem = (t: string) => t.slice(0, 5);

function nodeLexicon(g: Graph) {
  return g.nodes.map((n) => {
    const lex = new Map<string, number>();
    const add = (text: string | undefined, weight: number) => {
      for (const t of tokenize(text ?? '')) lex.set(stem(t), Math.max(lex.get(stem(t)) ?? 0, weight));
    };
    if (!n.label) return lex;
    add(n.id.replace(/-/g, ' '), 3);
    add(n.label, 3);
    add((n.keywords ?? []).join(' '), 2);
    add(n.summary, 1);
    return lex;
  });
}

const lexiconCache = new WeakMap<Graph, Map<string, number>[]>();

export function interpret(text: string, g: Graph): Interpretation {
  const tokens = tokenize(text);
  if (!lexiconCache.has(g)) lexiconCache.set(g, nodeLexicon(g));
  const lexicon = lexiconCache.get(g)!;

  // Atenção: pontuação por nó, softmax só entre os que pontuaram.
  const scores = lexicon.map((lex) => tokens.reduce((s, t) => s + (lex.get(stem(t)) ?? 0), 0));
  const scored = scores.map((score, node) => ({ node, score })).filter((s) => s.score > 0);
  const max = Math.max(0, ...scored.map((s) => s.score));
  const exp = scored.map((s) => ({ node: s.node, e: Math.exp(s.score - max) }));
  const sum = exp.reduce((s, x) => s + x.e, 0);
  const attention = exp
    .map((x) => ({ node: x.node, weight: x.e / sum }))
    .sort((a, b) => b.weight - a.weight || a.node - b.node)
    .slice(0, 6);

  // Intenção: a que tiver mais palavras reconhecidas; empate fica com a primeira da lista.
  let intent: IntentId | null = null;
  let best = 0;
  for (const { id, patterns } of INTENTS) {
    const hits = tokens.filter((t) => patterns.some((p) => hit(t, p))).length;
    if (hits > best) {
      best = hits;
      intent = id;
    }
  }
  if (intent && NEEDS_NODE.has(intent) && attention.length === 0) intent = null;
  // Pergunta sobre um nó ("como funciona o matching?") pede descrição, não execução.
  const asking = /\?\s*$/.test(text) || /^(como|o que|oque|qual|quais|explica|explique|fale|conte)\b/.test(normalize(text.trim()));
  if (asking && attention.length > 0 && (intent === 'match' || intent === 'open')) intent = null;

  const top = attention[0];
  const id = (i: number) => g.nodes[i].id;
  const number = tokens.map(Number).find((n) => Number.isFinite(n));
  let command: string | null = null;
  switch (intent) {
    case 'path': {
      const [a, b] = attention;
      command = b ? `path ${id(a.node)} ${id(b.node)}` : `path nexus ${id(top?.node ?? 0)}`;
      break;
    }
    case 'bfs':
      command = top ? `bfs ${id(top.node)}` : 'bfs';
      break;
    case 'match':
      command = number ? `match ${number}` : 'match';
      break;
    case 'open':
      command = `open ${id(top.node)}`;
      break;
    case 'agents':
      command = `agents ${Math.min(600, Math.max(0, number ?? 300))}`;
      break;
    case 'speed':
      command = `speed ${tokens.some((t) => ['devagar', 'lento', 'lenta'].includes(t)) ? 0.4 : 3}`;
      break;
    case null:
      break;
    default:
      command = intent;
  }

  const confidence = intent
    ? Math.min(0.97, 0.55 + 0.15 * best + (top && command?.includes(' ') ? 0.25 * top.weight : 0))
    : top
      ? 0.5 * top.weight
      : 0;
  return { tokens, attention, intent, command, confidence: Math.round(confidence * 100) / 100 };
}
