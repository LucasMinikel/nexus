import { describe, expect, it } from 'vitest';
import { buildNetwork, commute, dijkstra, nearestNode, nodeId, RIVER_COL, straightKm } from '../city/city';
import { assign, countBlockingPairs, hungarian, type Algorithm } from './assignment';
import { makeScenario, rng, makeCandidate, makeVacancy } from './data';
import { evaluateAll, PathCache } from './engine';
import { evaluatePair } from './score';
import type { Constraints, Weights } from './types';
import { syntheticCity } from '../city/synthetic';

const weights: Weights = { geo: 3, professional: 3, education: 2, schedule: 1, preferences: 1 };
const allConstraints: Constraints = { modality: true, course: true, schedule: true, commute: true, fares: true };
const net = buildNetwork();

function bruteForceMin(cost: number[][]): number {
  const n = cost.length;
  const best = (row: number, used: Set<number>): number => {
    if (row === n) return 0;
    let min = Infinity;
    for (let j = 0; j < cost[0].length; j++) {
      if (used.has(j)) continue;
      used.add(j);
      min = Math.min(min, cost[row][j] + best(row + 1, used));
      used.delete(j);
    }
    return min;
  };
  return best(0, new Set());
}

describe('rede viária', () => {
  it('atravessar o rio longe de uma ponte custa mais que a linha reta sugere', () => {
    const a = { x: 4.4, y: 0.5 };
    const b = { x: 5.1, y: 0.5 };
    const sp = dijkstra(net, nearestNode(b));
    const trip = commute(a, b, sp);
    expect(straightKm(a, b)).toBeLessThan(1);
    expect(trip.networkKm).toBeGreaterThan(2.5);
  });

  it('nearestNode respeita o lado do rio', () => {
    expect(nearestNode({ x: 4.7, y: 1 }) % 21).toBe(RIVER_COL);
    expect(nearestNode({ x: 4.8, y: 1 }) % 21).toBe(RIVER_COL + 1);
  });

  it('Dijkstra é simétrico na rede não direcionada', () => {
    const a = nodeId(2, 3);
    const b = nodeId(15, 18);
    expect(dijkstra(net, a).minutes[b]).toBeCloseTo(dijkstra(net, b).minutes[a]);
  });
});

describe('hungarian', () => {
  it('encontra o custo mínimo igual à força bruta', () => {
    const r = rng(7);
    for (let t = 0; t < 30; t++) {
      const n = r.int(1, 5);
      const m = r.int(n, 6);
      const cost = Array.from({ length: n }, () => Array.from({ length: m }, () => r.int(-20, 20)));
      const cols = hungarian(cost);
      expect(new Set(cols).size).toBe(n);
      const total = cols.reduce((s, j, i) => s + cost[i][j], 0);
      expect(total).toBe(bruteForceMin(cost));
    }
  });
});

describe('score e restrições', () => {
  it('restrição obrigatória não é compensada por score alto', () => {
    const r = rng(1);
    const v = { ...makeVacancy(r, 'V'), modality: 'presencial' as const, shifts: ['manha' as const] };
    const c = { ...makeCandidate(r, 'C'), course: v.courses[0], skills: [...v.skills], availability: ['manha' as const], modalities: ['remoto' as const] };
    const e = evaluatePair(v, c, dijkstra(net, nearestNode(v.pos)), weights, allConstraints);
    expect(e.dims.professional.value).toBe(1);
    expect(e.feasible).toBe(false);
    expect(e.violations.join()).toMatch(/Modalidade/);
  });

  it('contribuições somam o score e o score fica em [0, 1]', () => {
    const s = makeScenario(3, 8, 20);
    const { all } = evaluateAll(s, new PathCache(syntheticCity()), weights, allConstraints);
    for (const e of all) {
      const sum = Object.values(e.contributions).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(e.score);
      expect(e.score).toBeGreaterThanOrEqual(0);
      expect(e.score).toBeLessThanOrEqual(1);
    }
  });
});

describe('alocação', () => {
  const s = makeScenario(42, 10, 30);
  const relaxed: Constraints = { modality: true, course: false, schedule: false, commute: true, fares: true };
  const { evalOf } = evaluateAll(s, new PathCache(syntheticCity()), weights, relaxed);
  const run = (a: Algorithm) => assign(a, s.vacancies, s.candidates, evalOf, weights);

  it.each<Algorithm>(['greedy', 'hungarian', 'stable'])('%s respeita capacidade, unicidade e viabilidade', (a) => {
    const { pairs } = run(a);
    expect(new Set(pairs.map((p) => p.candidateId)).size).toBe(pairs.length);
    for (const v of s.vacancies) expect(pairs.filter((p) => p.vacancyId === v.id).length).toBeLessThanOrEqual(v.slots);
    for (const p of pairs) expect(evalOf(p.vacancyId, p.candidateId).feasible).toBe(true);
  });

  it('Hungarian tem score total ≥ Greedy', () => {
    expect(run('hungarian').metrics.totalScore).toBeGreaterThanOrEqual(run('greedy').metrics.totalScore - 1e-9);
  });

  it('Gale–Shapley não deixa pares bloqueantes', () => {
    const { pairs } = run('stable');
    expect(countBlockingPairs(pairs, s.vacancies, s.candidates, evalOf, weights)).toBe(0);
  });
});
