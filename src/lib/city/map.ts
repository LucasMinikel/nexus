/**
 * Cidade em que o cálculo roda: a grade sintética (testes do Lab) ou uma rede viária real
 * do OpenStreetMap, pré-processada por scripts/maps/build.mjs.
 *
 * Coordenadas em km dentro de um quadrado [0, km]; x para leste, y para o sul (como no SVG).
 */
import type { Edge, Point, RoadNetwork } from './city';

export interface WaterShape {
  /** 0 = área (polígono preenchido), 1 = rio ou canal, 2 = linha da costa. */
  kind: 0 | 1 | 2;
  pts: Point[];
}

export interface CityMap {
  id: string;
  name: string;
  /** Sigla do estado; ausente na cidade sintética. */
  uf?: string;
  /** Centro real (graus); ausente na cidade sintética. */
  center?: { lat: number; lon: number };
  km: number;
  /** Divisa oeste–leste das regiões. */
  splitX: number;
  network: RoadNetwork;
  /** Classe de cada segmento de \`network.segments\` (0 expressa … 5 compartilhada). */
  segmentClass: number[];
  /** Geometria intermediária de cada segmento, de \`a\` para \`b\` (vazia quando é reta). */
  segmentShape: Point[][];
  water: WaterShape[];
  /** Polos de emprego: onde as vagas se concentram. */
  hubs: Point[];
  point(node: number): Point;
  /** Nó da rede mais próximo de um ponto (onde a pessoa entra na rede a pé). */
  nearest(p: Point): number;
  /** Leva um ponto sorteado para um lugar plausível de morar ou trabalhar (perto de uma rua). */
  place(p: Point): Point;
}

/** Cidade aberta antes de qualquer escolha de quem visita. */
export const DEFAULT_CITY = 'sao-paulo';

/** Velocidade média por classe de via, km/h (expressa, arterial, coletora, terciária, local, compartilhada). */
export const CLASS_SPEED_KMH = [50, 35, 30, 25, 20, 10] as const;
export const CLASS_LABEL = ['Expressa', 'Arterial', 'Coletora', 'Terciária', 'Local', 'Compartilhada'] as const;

/** Formato do arquivo em public/maps/<id>.json (metros inteiros, listas planas). */
export interface CityMapFile {
  v: 1;
  id: string;
  name: string;
  uf: string;
  lat: number;
  lon: number;
  km: number;
  /** Vértices: x0, y0, x1, y1… */
  n: number[];
  /** Arestas: a, b, classe, metros… */
  e: number[];
  /** Pontos intermediários de cada aresta: x, y… */
  g: number[][];
  /** Água: [tipo, x, y, x, y…] */
  w: number[][];
  hubs: [number, number][];
}

export interface CityIndexEntry {
  id: string;
  name: string;
  uf: string;
  lat: number;
  lon: number;
  /** Há linhas de transporte público suficientes no OSM para esta cidade. */
  transit?: boolean;
  /** Trechos de linha mapeados (mesmo quando poucos demais para ligar o modo). */
  transitLines?: number;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function parseCityMap(f: CityMapFile): CityMap {
  const count = f.n.length / 2;
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    xs[i] = f.n[2 * i] / 1000;
    ys[i] = f.n[2 * i + 1] / 1000;
  }
  const adjacency: Edge[][] = Array.from({ length: count }, () => []);
  const segments: RoadNetwork['segments'] = [];
  const segmentClass: number[] = [];
  const segmentShape: Point[][] = [];
  for (let k = 0; k < f.e.length / 4; k++) {
    const [a, b, cls, meters] = f.e.slice(4 * k, 4 * k + 4);
    const km = meters / 1000;
    const minutes = (km / CLASS_SPEED_KMH[cls]) * 60;
    adjacency[a].push({ to: b, km, minutes });
    adjacency[b].push({ to: a, km, minutes });
    segments.push({ a, b, avenue: cls <= 2 });
    segmentClass.push(cls);
    const g = f.g[k] ?? [];
    const shape: Point[] = [];
    for (let i = 0; i < g.length; i += 2) shape.push({ x: g[i] / 1000, y: g[i + 1] / 1000 });
    segmentShape.push(shape);
  }

  // Índice espacial: baldes de 250 m.
  const CELL = 0.25;
  const side = Math.ceil(f.km / CELL) + 1;
  const buckets: number[][] = Array.from({ length: side * side }, () => []);
  const cellOf = (v: number) => Math.min(side - 1, Math.max(0, Math.floor(v / CELL)));
  for (let i = 0; i < count; i++) buckets[cellOf(ys[i]) * side + cellOf(xs[i])].push(i);

  const nearest = (p: Point): number => {
    const cx = cellOf(p.x);
    const cy = cellOf(p.y);
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; r < side; r++) {
      // Um anel a mais depois de achar: o mais próximo pode estar no anel vizinho.
      if (best !== -1 && (r - 1) * CELL > Math.sqrt(bestD)) break;
      for (let y = cy - r; y <= cy + r; y++) {
        if (y < 0 || y >= side) continue;
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || x >= side || (Math.abs(x - cx) !== r && Math.abs(y - cy) !== r)) continue;
          for (const i of buckets[y * side + x]) {
            const d = (xs[i] - p.x) ** 2 + (ys[i] - p.y) ** 2;
            if (d < bestD || (d === bestD && i < best)) {
              bestD = d;
              best = i;
            }
          }
        }
      }
    }
    return best;
  };

  const point = (i: number): Point => ({ x: xs[i], y: ys[i] });
  return {
    id: f.id,
    name: f.name,
    uf: f.uf,
    center: { lat: f.lat, lon: f.lon },
    km: f.km,
    splitX: f.km / 2,
    network: { adjacency, segments },
    segmentClass,
    segmentShape,
    water: f.w.map(([kind, ...xy]) => {
      const pts: Point[] = [];
      for (let i = 0; i < xy.length; i += 2) pts.push({ x: xy[i] / 1000, y: xy[i + 1] / 1000 });
      return { kind: kind as 0 | 1 | 2, pts };
    }),
    hubs: f.hubs.map(([x, y]) => ({ x: x / 1000, y: y / 1000 })),
    point,
    nearest,
    // A 40 m da esquina mais próxima, na direção do ponto sorteado: perto de uma rua, nunca no mar.
    place: (p) => {
      const q = point(nearest(p));
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      const k = d > 0 ? Math.min(d, 0.04) / d : 0;
      return { x: round3(q.x + (p.x - q.x) * k), y: round3(q.y + (p.y - q.y) * k) };
    },
  };
}

/** Distância em km entre dois pontos geográficos (haversine). */
export function geoKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Cidade com mapa mais próxima de uma posição. */
export function nearestCity<T extends { lat: number; lon: number }>(cities: T[], at: { lat: number; lon: number }): { city: T; km: number } {
  let best = cities[0];
  let bestKm = Infinity;
  for (const c of cities) {
    const d = geoKm(c, at);
    if (d < bestKm) {
      bestKm = d;
      best = c;
    }
  }
  return { city: best, km: bestKm };
}
