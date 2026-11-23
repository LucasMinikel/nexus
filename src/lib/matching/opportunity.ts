/**
 * Mapa de oportunidades: a cidade em hexágonos, com o que cada um alcança.
 *
 * Por que hexágonos: todos os vizinhos ficam à mesma distância do centro e a área é igual em qualquer
 * parte do mapa, então a cor compara lugares de forma justa (as 6 regiões fixas têm tamanhos e formas
 * arbitrários). A grade é local, em km, sobre o quadrado do mapa; o H3 faria o mesmo em latitude/longitude.
 *
 * Acesso a vagas de um hexágono = postos abertos que alguém morando no centro dele alcança dentro do tempo,
 * pelo mesmo cálculo de deslocamento do matching (Dijkstra a partir de cada vaga, já em cache).
 */
import { commute, type Point } from '../city/city';
import type { CityMap } from '../city/map';
import type { PathCache } from './engine';
import type { Candidate, Vacancy } from './types';

export interface Hex {
  id: number;
  center: Point;
  /** Vértices, para desenhar. */
  pts: Point[];
}

/** Raio (centro → vértice) padrão: hexágonos de ~0,8 km de lado a lado. */
export const HEX_KM = 0.45;

/**
 * Grade de hexágonos (ponta para cima) cobrindo o mapa. Só entram hexágonos com rua a menos de um raio do
 * centro: mar, represa ou parque sem ruas ficam de fora.
 */
export function hexGrid(city: CityMap, r = HEX_KM): Hex[] {
  const w = Math.sqrt(3) * r;
  const h = 1.5 * r;
  const out: Hex[] = [];
  for (let j = 0; j * h <= city.km + r; j++) {
    for (let i = 0; i * w <= city.km + w; i++) {
      const center = { x: i * w + (j % 2 ? w / 2 : 0), y: j * h };
      if (center.x > city.km + w / 2) continue;
      const near = city.point(city.nearest(center));
      if (Math.hypot(near.x - center.x, near.y - center.y) > r) continue;
      const pts = Array.from({ length: 6 }, (_, k) => {
        const a = (Math.PI / 180) * (60 * k - 30);
        return { x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) };
      });
      out.push({ id: out.length, center, pts });
    }
  }
  return out;
}

/** Hexágono de um ponto: o de centro mais próximo (numa grade de hexágonos, é o que contém o ponto). */
export function hexOf(hexes: Hex[], p: Point): number {
  let best = -1;
  let bestD = Infinity;
  for (const hx of hexes) {
    const d = (hx.center.x - p.x) ** 2 + (hx.center.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = hx.id;
    }
  }
  return best;
}

export interface HexStat {
  /** Postos abertos alcançáveis a partir do centro dentro do tempo. */
  slots: number;
  /** Vagas alcançáveis (ids). */
  vacancies: string[];
  /** Candidatos que moram no hexágono. */
  residents: number;
  /** Desses, quantos não servem para nenhuma vaga (pelas regras obrigatórias). */
  stranded: number;
}

export interface OpportunityInput {
  city: CityMap;
  paths: PathCache;
  hexes: Hex[];
  /** Vagas consideradas (já filtradas); as remotas são ignoradas, porque valem de qualquer lugar. */
  vacancies: Vacancy[];
  candidates: Candidate[];
  /** Postos ainda abertos de cada vaga. */
  open: (v: Vacancy) => number;
  minutes: number;
  /** No transporte público, limitar às conduções que cada vaga paga (a mesma regra do matching). */
  limitFares: boolean;
  /** Candidatos que não servem para nenhuma vaga considerada. */
  stranded: Set<string>;
}

export function opportunityMap(o: OpportunityInput): HexStat[] {
  const stats: HexStat[] = o.hexes.map(() => ({ slots: 0, vacancies: [], residents: 0, stranded: 0 }));
  for (const v of o.vacancies) {
    const open = o.open(v);
    if (v.modality === 'remoto' || open <= 0) continue;
    const sp = o.paths.fromNode(o.city.nearest(v.pos));
    const maxRides = o.limitFares ? v.fares / 2 : Infinity;
    for (const hx of o.hexes) {
      if (commute(hx.center, v.pos, sp, o.city, maxRides).minutes <= o.minutes) {
        stats[hx.id].slots += open;
        stats[hx.id].vacancies.push(v.id);
      }
    }
  }
  for (const c of o.candidates) {
    const s = stats[hexOf(o.hexes, c.pos)];
    s.residents++;
    if (o.stranded.has(c.id)) s.stranded++;
  }
  return stats;
}
