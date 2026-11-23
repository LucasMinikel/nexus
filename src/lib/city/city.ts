/**
 * Cidade sintética com rede viária em grade.
 *
 * Existe para que o tempo de deslocamento venha de um caminho mínimo na rede
 * (Dijkstra) e nunca da distância em linha reta. Um rio com poucas pontes faz
 * a diferença entre as duas medidas ficar visível.
 *
 * Coordenadas em km. y cresce para o sul (mesma orientação do SVG).
 */

import type { CityMap } from './map';
import { syntheticCity } from './synthetic';

export interface Point {
  x: number;
  y: number;
}

export interface Edge {
  to: number;
  km: number;
  minutes: number;
  /** Embarque num veículo (transporte público): conta uma condução. */
  board?: boolean;
}

export type RegionId = 'NO' | 'NL' | 'CO' | 'CL' | 'SO' | 'SL';

export const REGIONS: Record<RegionId, string> = {
  NO: 'Norte-Oeste',
  NL: 'Norte-Leste',
  CO: 'Centro-Oeste',
  CL: 'Centro-Leste',
  SO: 'Sul-Oeste',
  SL: 'Sul-Leste',
};

export const CITY_KM = 10;
export const GRID = 21; // nós por eixo
export const SPACING = CITY_KM / (GRID - 1);
/** O rio passa entre as colunas RIVER_COL e RIVER_COL + 1. */
export const RIVER_COL = 9;
export const RIVER_X = (RIVER_COL + 0.5) * SPACING;
export const BRIDGE_ROWS = [3, 10, 17];

export const SPEED_KMH = { avenue: 40, street: 20, walk: 5 } as const;

const isAvenue = (i: number) => i % 5 === 0;

export function nodeId(col: number, row: number): number {
  return row * GRID + col;
}

export function nodePoint(id: number): Point {
  return { x: (id % GRID) * SPACING, y: Math.floor(id / GRID) * SPACING };
}

/** Seis regiões: terços norte–sul × metades oeste–leste (na sintética, o rio separa oeste e leste). */
export function regionOf(p: Point, city: CityMap = syntheticCity()): RegionId {
  const ns = p.y < city.km / 3 ? 'N' : p.y < (2 * city.km) / 3 ? 'C' : 'S';
  const ew = p.x < city.splitX ? 'O' : 'L';
  return `${ns}${ew}` as RegionId;
}

export interface RoadNetwork {
  adjacency: Edge[][];
  /** Arestas únicas, para desenhar a rede. */
  segments: { a: number; b: number; avenue: boolean }[];
}

export function buildNetwork(): RoadNetwork {
  const adjacency: Edge[][] = Array.from({ length: GRID * GRID }, () => []);
  const segments: RoadNetwork['segments'] = [];

  const link = (a: number, b: number, avenue: boolean) => {
    const speed = avenue ? SPEED_KMH.avenue : SPEED_KMH.street;
    const minutes = (SPACING / speed) * 60;
    adjacency[a].push({ to: b, km: SPACING, minutes });
    adjacency[b].push({ to: a, km: SPACING, minutes });
    segments.push({ a, b, avenue });
  };

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (col + 1 < GRID) {
        const crossesRiver = col === RIVER_COL;
        if (!crossesRiver || BRIDGE_ROWS.includes(row)) {
          link(nodeId(col, row), nodeId(col + 1, row), isAvenue(row) || crossesRiver);
        }
      }
      if (row + 1 < GRID) link(nodeId(col, row), nodeId(col, row + 1), isAvenue(col));
    }
  }
  return { adjacency, segments };
}

export function straightKm(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Nó mais próximo na cidade sintética, do mesmo lado do rio. */
export function nearestNode(p: Point): number {
  return syntheticCity().nearest(p);
}

export interface ShortestPaths {
  source: number;
  /** Menor tempo até cada nó, com qualquer número de conduções. */
  minutes: Float64Array;
  /** Quilômetros percorridos no caminho mais rápido até cada nó. */
  km: Float64Array;
  prev: Int32Array;
  /**
   * Só no transporte público: o mesmo cálculo separado por número exato de conduções (0..maxRides).
   * Estado s = k·n + nó; `prev` aponta para o estado anterior.
   */
  rides?: { maxRides: number; n: number; minutes: Float64Array; km: Float64Array; prev: Int32Array };
}

class Heap {
  private a: [number, number][] = [];
  get size() {
    return this.a.length;
  }
  push(item: [number, number]) {
    const h = this.a;
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (h[parent][0] <= h[i][0]) break;
      [h[parent], h[i]] = [h[i], h[parent]];
      i = parent;
    }
  }
  pop(): [number, number] {
    const h = this.a;
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Dijkstra com heap binário; minimiza tempo.
 *
 * Com `maxRides`, conta as conduções (arestas `board`) e guarda o melhor tempo para cada número
 * exato de conduções, até `maxRides`: é o que responde "quanto demora com no máximo 2 conduções?".
 */
export function dijkstra(net: RoadNetwork, source: number, maxRides?: number): ShortestPaths {
  const n = net.adjacency.length;
  const layers = maxRides === undefined ? 1 : maxRides + 1;
  const sMin = new Float64Array(n * layers).fill(Infinity);
  const sKm = new Float64Array(n * layers).fill(Infinity);
  const sPrev = new Int32Array(n * layers).fill(-1);
  sMin[source] = 0;
  sKm[source] = 0;
  const heap = new Heap();
  heap.push([0, source]);

  while (heap.size > 0) {
    const [d, s] = heap.pop();
    if (d > sMin[s]) continue;
    const u = s % n;
    const k = (s - u) / n;
    for (const e of net.adjacency[u]) {
      const k2 = maxRides !== undefined && e.board ? k + 1 : k;
      if (k2 >= layers) continue;
      const t = k2 * n + e.to;
      const nd = d + e.minutes;
      if (nd < sMin[t]) {
        sMin[t] = nd;
        sKm[t] = sKm[s] + e.km;
        sPrev[t] = s;
        heap.push([nd, t]);
      }
    }
  }
  if (maxRides === undefined) return { source, minutes: sMin, km: sKm, prev: sPrev };

  // Resumo por nó: o melhor entre todos os números de conduções.
  const minutes = new Float64Array(n).fill(Infinity);
  const km = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  for (let v = 0; v < n; v++) {
    for (let k = 0; k < layers; k++) {
      const s = k * n + v;
      if (sMin[s] < minutes[v]) {
        minutes[v] = sMin[s];
        km[v] = sKm[s];
        prev[v] = sPrev[s] === -1 ? -1 : sPrev[s] % n;
      }
    }
  }
  return { source, minutes, km, prev, rides: { maxRides, n, minutes: sMin, km: sKm, prev: sPrev } };
}

/** Caminho do nó `target` até a origem do Dijkstra, na ordem target → origem. */
export function pathTo(sp: ShortestPaths, target: number): number[] {
  const path: number[] = [];
  for (let v = target; v !== -1; v = sp.prev[v]) path.push(v);
  return path;
}

export interface Commute {
  straightKm: number;
  networkKm: number;
  minutes: number;
  /** Nós da rede percorridos, da origem ao destino. */
  path: number[];
  /** Transporte público: conduções usadas num sentido (cada embarque conta uma). */
  rides?: number;
  /** Transporte público: tempo restante até o destino em cada nó de `path`. */
  along?: number[];
}

/**
 * Deslocamento porta a porta: caminhada até a rede, trajeto pela rede e
 * caminhada até o destino. `fromVacancy` deve ter sido calculado a partir do nó da vaga.
 * No transporte público, `maxRides` limita as conduções (padrão: o mais rápido com qualquer número).
 */
export function commute(from: Point, to: Point, fromVacancy: ShortestPaths, city: CityMap = syntheticCity(), maxRides = Infinity): Commute {
  const startNode = city.nearest(from);
  const walkIn = straightKm(from, city.point(startNode));
  const walkOut = straightKm(city.point(fromVacancy.source), to);
  const walkMin = ((walkIn + walkOut) / SPEED_KMH.walk) * 60;
  const r = fromVacancy.rides;
  if (!r) {
    return {
      straightKm: straightKm(from, to),
      networkKm: walkIn + fromVacancy.km[startNode] + walkOut,
      minutes: walkMin + fromVacancy.minutes[startNode],
      path: pathTo(fromVacancy, startNode),
    };
  }
  let best = startNode;
  for (let k = 1; k <= Math.min(maxRides, r.maxRides); k++) {
    const s = k * r.n + startNode;
    if (r.minutes[s] < r.minutes[best]) best = s;
  }
  const path: number[] = [];
  const along: number[] = [];
  for (let s = best; s !== -1; s = r.prev[s]) {
    path.push(s % r.n);
    along.push(r.minutes[s]);
  }
  return {
    straightKm: straightKm(from, to),
    networkKm: walkIn + r.km[best] + walkOut,
    minutes: walkMin + r.minutes[best],
    path,
    rides: Math.floor(best / r.n),
    along,
  };
}
