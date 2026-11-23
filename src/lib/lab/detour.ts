/**
 * Teste do Lab: a distância em linha reta prevê o tempo de deslocamento?
 *
 * Usa a mesma cidade sintética do projeto Vagas e Candidatos: rua, avenida,
 * rio com três pontes e Dijkstra minimizando tempo.
 */
import { CITY_KM, RIVER_X, commute, dijkstra, nearestNode, type Commute, type Point, type RoadNetwork } from '../city/city';
import type { Rng } from '../random';

export interface Trip extends Commute {
  from: Point;
  to: Point;
  crossesRiver: boolean;
}

export function trip(net: RoadNetwork, from: Point, to: Point): Trip {
  const c = commute(from, to, dijkstra(net, nearestNode(to)));
  return { ...c, from, to, crossesRiver: from.x < RIVER_X !== to.x < RIVER_X };
}

export function randomTrip(net: RoadNetwork, r: Rng): Trip {
  const p = (): Point => ({ x: r.next() * CITY_KM, y: r.next() * CITY_KM });
  return trip(net, p(), p());
}

/** Correlação de Pearson. */
export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Reta de mínimos quadrados: minutos ≈ slope · km + intercept. */
export function fitLine(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxx ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx };
}

export interface DetourSummary {
  trips: number;
  /** Correlação entre km em linha reta e minutos de viagem. */
  r: number;
  slope: number;
  intercept: number;
  /** % de viagens em que a estimativa pela linha reta erra mais que RULE.maxError. */
  badPct: number;
  /** O mesmo, só entre as viagens que cruzam o rio. */
  badPctCrossing: number;
  verdict: 'confirmada' | 'refutada' | 'inconclusiva';
}

/**
 * Hipótese: "a linha reta basta para estimar o tempo". Confirmada se a melhor reta
 * (minutos em função de km) errar mais de 30% em no máximo 10% das viagens.
 */
export const RULE = { maxError: 0.3, maxBadPct: 10, minTrips: 50 };

export function summarizeTrips(trips: Trip[]): DetourSummary {
  const xs = trips.map((t) => t.straightKm);
  const ys = trips.map((t) => t.minutes);
  const { slope, intercept } = trips.length >= 2 ? fitLine(xs, ys) : { slope: 0, intercept: 0 };
  const bad = (t: Trip) => Math.abs(slope * t.straightKm + intercept - t.minutes) / t.minutes > RULE.maxError;
  const pct = (ts: Trip[]) => (ts.length ? (ts.filter(bad).length / ts.length) * 100 : 0);
  const badPct = pct(trips);
  return {
    trips: trips.length,
    r: pearson(xs, ys),
    slope,
    intercept,
    badPct,
    badPctCrossing: pct(trips.filter((t) => t.crossesRiver)),
    verdict: trips.length < RULE.minTrips ? 'inconclusiva' : badPct <= RULE.maxBadPct ? 'confirmada' : 'refutada',
  };
}
