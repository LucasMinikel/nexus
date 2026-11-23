/**
 * Grafo da cena “NEXUS” da home.
 *
 * Os nós com rótulo são as partes reais do site (seções, experimentos, posts);
 * os nós “poeira” formam a rede ao redor. BFS e Dijkstra aqui são os mesmos
 * que a cena anima: a animação mostra o resultado do algoritmo, não uma imitação.
 */
import { rng } from '../random';

export type NodeKind = 'core' | 'section' | 'experiment' | 'project' | 'dust';

export interface GraphItem {
  id: string;
  label: string;
  kind: 'section' | 'experiment' | 'project';
  href: string;
  /** id da seção a que pertence (testes e projetos). */
  parent?: string;
  /** Uma frase sobre o nó, usada pelo núcleo do terminal ao descrevê-lo. */
  summary?: string;
  /** Palavras extras que o núcleo reconhece como referência ao nó. */
  keywords?: string[];
}

export interface GraphNode {
  id: string;
  label?: string;
  kind: NodeKind;
  href?: string;
  summary?: string;
  keywords?: string[];
  pos: [number, number, number];
}

export interface Graph {
  nodes: GraphNode[];
  edges: [number, number][];
  adjacency: number[][];
}

const dist = (a: GraphNode, b: GraphNode) =>
  Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);

export function buildGraph(items: GraphItem[], seed = 1, dustCount = 220): Graph {
  const r = rng(seed);
  const nodes: GraphNode[] = [
    { id: 'nexus', label: 'NEXUS', kind: 'core', href: '/', summary: 'O núcleo: interpreta perguntas e liga todas as partes do site.', keywords: ['nucleo', 'centro', 'inicio', 'home'], pos: [0, 0, 0] },
  ];
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  const link = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push([a, b]);
  };

  // Seções em anel ao redor do núcleo, levemente fora do plano.
  const sections = items.filter((i) => i.kind === 'section');
  sections.forEach((s, i) => {
    const angle = (i / sections.length) * Math.PI * 2;
    nodes.push({ id: s.id, label: s.label, kind: 'section', href: s.href, summary: s.summary, keywords: s.keywords, pos: [Math.cos(angle) * 6, (r.next() - 0.5) * 2.5, Math.sin(angle) * 6] });
    link(0, nodes.length - 1);
  });
  const indexOf = new Map(nodes.map((n, i) => [n.id, i]));

  // Testes e projetos orbitam a própria seção.
  for (const item of items.filter((i) => i.kind !== 'section')) {
    const parent = item.parent ? indexOf.get(item.parent) : undefined;
    const base = parent !== undefined ? nodes[parent].pos : ([0, 0, 0] as const);
    const theta = r.next() * Math.PI * 2;
    const phi = Math.acos(2 * r.next() - 1);
    const radius = 2.2 + r.next() * 1.3;
    nodes.push({
      id: item.id,
      label: item.label,
      kind: item.kind,
      href: item.href,
      summary: item.summary,
      keywords: item.keywords,
      pos: [
        base[0] + radius * Math.sin(phi) * Math.cos(theta),
        base[1] + radius * Math.cos(phi),
        base[2] + radius * Math.sin(phi) * Math.sin(theta),
      ],
    });
    link(parent ?? 0, nodes.length - 1);
    indexOf.set(item.id, nodes.length - 1);
  }

  // Poeira: espiral de Fibonacci numa casca esférica, com ruído.
  const firstDust = nodes.length;
  for (let i = 0; i < dustCount; i++) {
    const y = 1 - (2 * (i + 0.5)) / dustCount;
    const ring = Math.sqrt(1 - y * y);
    const theta = i * Math.PI * (3 - Math.sqrt(5));
    const radius = 4 + r.next() * 9;
    nodes.push({
      id: `d${i}`,
      kind: 'dust',
      pos: [Math.cos(theta) * ring * radius, y * radius * 0.7, Math.sin(theta) * ring * radius],
    });
  }

  // Cada nó se liga aos vizinhos mais próximos (poeira: 3; rotulados: 2 pontes para a poeira).
  const nearest = (i: number, k: number, from = 0) =>
    nodes
      .map((n, j) => ({ j, d: j === i ? Infinity : dist(nodes[i], n) }))
      .filter((x) => x.j >= from)
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
      .map((x) => x.j);
  for (let i = firstDust; i < nodes.length; i++) for (const j of nearest(i, 3)) link(i, j);
  for (let i = 1; i < firstDust; i++) for (const j of nearest(i, 2, firstDust)) link(i, j);

  // Garante um grafo conexo: liga cada componente isolado ao nó alcançável mais próximo.
  for (;;) {
    const reached = new Set(bfsLayers(withAdjacency(nodes, edges), 0).flat());
    const orphan = nodes.findIndex((_, i) => !reached.has(i));
    if (orphan === -1) break;
    let best = 0;
    for (const j of reached) if (dist(nodes[orphan], nodes[j]) < dist(nodes[orphan], nodes[best])) best = j;
    link(orphan, best);
  }
  return withAdjacency(nodes, edges);
}

function withAdjacency(nodes: GraphNode[], edges: [number, number][]): Graph {
  const adjacency: number[][] = nodes.map(() => []);
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  return { nodes, edges, adjacency };
}

/** Busca em largura: camada k contém os nós a k arestas de `start`. */
export function bfsLayers(g: Graph, start: number): number[][] {
  const seen = new Uint8Array(g.nodes.length);
  seen[start] = 1;
  const layers: number[][] = [[start]];
  for (;;) {
    const next: number[] = [];
    for (const u of layers[layers.length - 1]) {
      for (const v of g.adjacency[u]) {
        if (!seen[v]) {
          seen[v] = 1;
          next.push(v);
        }
      }
    }
    if (next.length === 0) return layers;
    layers.push(next);
  }
}

/** Dijkstra com peso = distância euclidiana. Retorna o caminho de a até b (inclusive), ou [] se não houver. */
export function shortestPath(g: Graph, a: number, b: number): number[] {
  const n = g.nodes.length;
  const d = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  d[a] = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u === -1 || d[i] < d[u])) u = i;
    if (u === -1 || d[u] === Infinity) break;
    if (u === b) break;
    done[u] = 1;
    for (const v of g.adjacency[u]) {
      const nd = d[u] + dist(g.nodes[u], g.nodes[v]);
      if (nd < d[v]) {
        d[v] = nd;
        prev[v] = u;
      }
    }
  }
  if (d[b] === Infinity) return [];
  const path = [b];
  while (path[path.length - 1] !== a) path.push(prev[path[path.length - 1]]);
  return path.reverse();
}

export function pathLength(g: Graph, path: number[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += dist(g.nodes[path[i - 1]], g.nodes[path[i]]);
  return total;
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Encontra um nó rotulado por id ou nome, aceitando prefixo e sem acentos. */
export function findNode(g: Graph, query: string): number {
  const q = normalize(query);
  if (!q) return -1;
  const labeled = g.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.label);
  const exact = labeled.find(({ n }) => normalize(n.id) === q || normalize(n.label!) === q);
  if (exact) return exact.i;
  const partial = labeled.find(({ n }) => normalize(n.id).startsWith(q) || normalize(n.label!).includes(q));
  return partial ? partial.i : -1;
}
