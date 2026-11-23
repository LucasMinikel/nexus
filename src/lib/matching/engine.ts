import { dijkstra, type ShortestPaths } from '../city/city';
import type { CityMap } from '../city/map';
import { isTransit, MAX_RIDES } from '../city/transit';
import type { EvalLookup } from './assignment';
import type { Scenario } from './data';
import { evaluatePair } from './score';
import type { Constraints, PairEvaluation, Weights } from './types';

/** Guarda um Dijkstra por nó de vaga; a rede da cidade não muda, então o cache vale por toda a sessão. */
export class PathCache {
  private cache = new Map<number, ShortestPaths>();
  constructor(readonly city: CityMap) {}

  fromNode(node: number): ShortestPaths {
    let sp = this.cache.get(node);
    if (!sp) {
      // No transporte público, separa por número de conduções (vale-transporte).
      sp = dijkstra(this.city.network, node, isTransit(this.city) ? MAX_RIDES : undefined);
      this.cache.set(node, sp);
    }
    return sp;
  }
}

/** Avalia todos os pares do cenário uma vez e devolve uma consulta O(1). */
export function evaluateAll(
  scenario: Scenario,
  paths: PathCache,
  weights: Weights,
  constraints: Constraints,
): { evalOf: EvalLookup; all: PairEvaluation[] } {
  const table = new Map<string, PairEvaluation>();
  for (const v of scenario.vacancies) {
    const sp = paths.fromNode(paths.city.nearest(v.pos));
    for (const c of scenario.candidates) {
      table.set(`${v.id}|${c.id}`, evaluatePair(v, c, sp, weights, constraints, paths.city));
    }
  }
  return {
    evalOf: (vid, cid) => {
      const e = table.get(`${vid}|${cid}`);
      if (!e) throw new Error(`Par não avaliado: ${vid}|${cid}`);
      return e;
    },
    all: [...table.values()],
  };
}
