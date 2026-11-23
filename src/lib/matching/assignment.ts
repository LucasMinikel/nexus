import { candidateUtility, vacancyUtility } from './score';
import type { Candidate, PairEvaluation, Vacancy, Weights } from './types';

export type Algorithm = 'greedy' | 'hungarian' | 'stable';

export const ALGORITHM_INFO: Record<Algorithm, { label: string; objective: string }> = {
  greedy: {
    label: 'Greedy',
    objective: 'Ordena todos os pares viáveis pelo score e aceita o melhor par livre a cada passo. Rápido, mas não garante o melhor total.',
  },
  hungarian: {
    label: 'Hungarian',
    objective: 'Maximiza a soma dos scores em um grafo bipartido (vagas expandidas em postos × candidatos). Ótimo global, O(n³).',
  },
  stable: {
    label: 'Stable (Gale–Shapley)',
    objective:
      'Candidatos propõem às vagas por ordem de preferência própria (geografia + preferências); vagas mantêm os melhores pelos critérios delas (profissional, educação, horário). Nenhum par prefere trocar.',
  },
};

export interface MatchPair {
  vacancyId: string;
  candidateId: string;
}

export interface AssignmentMetrics {
  pairs: number;
  totalScore: number;
  meanScore: number;
  /** Média de minutos de deslocamento entre os pares não remotos. */
  meanCommuteMin: number | null;
  filledSlots: number;
  totalSlots: number;
  unmatchedCandidates: number;
  blockingPairs: number;
  elapsedMs: number;
}

export interface AssignmentResult {
  algorithm: Algorithm;
  pairs: MatchPair[];
  metrics: AssignmentMetrics;
}

export type EvalLookup = (vacancyId: string, candidateId: string) => PairEvaluation;

export function assign(
  algorithm: Algorithm,
  vacancies: Vacancy[],
  candidates: Candidate[],
  evalOf: EvalLookup,
  weights: Weights,
): AssignmentResult {
  const start = performance.now();
  const pairs =
    algorithm === 'greedy'
      ? greedy(vacancies, candidates, evalOf)
      : algorithm === 'hungarian'
        ? hungarianAssign(vacancies, candidates, evalOf)
        : stableMatch(vacancies, candidates, evalOf, weights);
  const elapsedMs = performance.now() - start;
  return { algorithm, pairs, metrics: metricsOf(pairs, vacancies, candidates, evalOf, weights, elapsedMs) };
}

function feasiblePairs(vacancies: Vacancy[], candidates: Candidate[], evalOf: EvalLookup): PairEvaluation[] {
  const out: PairEvaluation[] = [];
  for (const v of vacancies) for (const c of candidates) {
    const e = evalOf(v.id, c.id);
    if (e.feasible) out.push(e);
  }
  return out;
}

export function greedy(vacancies: Vacancy[], candidates: Candidate[], evalOf: EvalLookup): MatchPair[] {
  const remaining = new Map(vacancies.map((v) => [v.id, v.slots]));
  const taken = new Set<string>();
  const pairs: MatchPair[] = [];
  const sorted = feasiblePairs(vacancies, candidates, evalOf).sort((a, b) => b.score - a.score);
  for (const e of sorted) {
    if (taken.has(e.candidateId) || remaining.get(e.vacancyId)! <= 0) continue;
    taken.add(e.candidateId);
    remaining.set(e.vacancyId, remaining.get(e.vacancyId)! - 1);
    pairs.push({ vacancyId: e.vacancyId, candidateId: e.candidateId });
  }
  return pairs;
}

/**
 * Algoritmo húngaro (versão com potenciais, O(n²·m)) minimizando custo em matriz n ≤ m.
 * Retorna, para cada linha, a coluna atribuída.
 */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const m = cost[0]?.length ?? 0;
  if (n === 0) return [];
  if (n > m) throw new Error('hungarian: a matriz precisa ter n ≤ m');
  const u = new Float64Array(n + 1);
  const v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1); // p[j] = linha (1-based) atribuída à coluna j
  const way = new Int32Array(m + 1);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(Infinity);
    const used = new Uint8Array(m + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const rowToCol = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] > 0) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

/**
 * Matching de peso máximo. Cada vaga vira `slots` postos; pares inviáveis custam 0,
 * o mesmo que ficar sem par, então nunca são preferidos a um par viável e são descartados no fim.
 */
export function hungarianAssign(vacancies: Vacancy[], candidates: Candidate[], evalOf: EvalLookup): MatchPair[] {
  const slots = vacancies.flatMap((v) => Array.from({ length: v.slots }, () => v));
  const size = Math.max(slots.length, candidates.length);
  if (size === 0) return [];
  const evals: (PairEvaluation | null)[][] = [];
  const cost: number[][] = [];
  for (let i = 0; i < size; i++) {
    evals.push([]);
    cost.push([]);
    for (let j = 0; j < size; j++) {
      const e = i < slots.length && j < candidates.length ? evalOf(slots[i].id, candidates[j].id) : null;
      evals[i].push(e);
      cost[i].push(e?.feasible ? -e.score : 0);
    }
  }
  const rowToCol = hungarian(cost);
  const pairs: MatchPair[] = [];
  rowToCol.forEach((j, i) => {
    const e = evals[i][j];
    if (e?.feasible) pairs.push({ vacancyId: e.vacancyId, candidateId: e.candidateId });
  });
  return pairs;
}

/** Gale–Shapley com capacidade (hospitais/residentes), candidatos propondo. */
export function stableMatch(
  vacancies: Vacancy[],
  candidates: Candidate[],
  evalOf: EvalLookup,
  weights: Weights,
): MatchPair[] {
  const prefs = new Map<string, string[]>();
  for (const c of candidates) {
    const ranked = vacancies
      .map((v) => evalOf(v.id, c.id))
      .filter((e) => e.feasible)
      .sort((a, b) => candidateUtility(b, weights) - candidateUtility(a, weights) || a.vacancyId.localeCompare(b.vacancyId))
      .map((e) => e.vacancyId);
    prefs.set(c.id, ranked);
  }
  const capacity = new Map(vacancies.map((v) => [v.id, v.slots]));
  const held = new Map<string, string[]>(vacancies.map((v) => [v.id, []]));
  const next = new Map(candidates.map((c) => [c.id, 0]));
  const free = candidates.map((c) => c.id);
  const vacancyRank = (vid: string, cid: string) => vacancyUtility(evalOf(vid, cid), weights);

  while (free.length > 0) {
    const cid = free.pop()!;
    const list = prefs.get(cid)!;
    const i = next.get(cid)!;
    if (i >= list.length) continue; // esgotou as opções viáveis
    next.set(cid, i + 1);
    const vid = list[i];
    const current = held.get(vid)!;
    current.push(cid);
    current.sort((a, b) => vacancyRank(vid, b) - vacancyRank(vid, a) || a.localeCompare(b));
    if (current.length > capacity.get(vid)!) free.push(current.pop()!);
  }
  return [...held].flatMap(([vacancyId, cids]) => cids.map((candidateId) => ({ vacancyId, candidateId })));
}

/**
 * Pares (vaga, candidato) viáveis que prefeririam um ao outro em vez da alocação atual,
 * medidos pelas utilidades de cada lado. Zero significa alocação estável.
 */
export function countBlockingPairs(
  pairs: MatchPair[],
  vacancies: Vacancy[],
  candidates: Candidate[],
  evalOf: EvalLookup,
  weights: Weights,
): number {
  const ofCandidate = new Map(pairs.map((p) => [p.candidateId, p.vacancyId]));
  const ofVacancy = new Map<string, string[]>();
  for (const p of pairs) ofVacancy.set(p.vacancyId, [...(ofVacancy.get(p.vacancyId) ?? []), p.candidateId]);

  let count = 0;
  for (const v of vacancies) {
    const holders = ofVacancy.get(v.id) ?? [];
    const worstHeld = holders.length < v.slots ? -Infinity : Math.min(...holders.map((c) => vacancyUtility(evalOf(v.id, c), weights)));
    for (const c of candidates) {
      if (ofCandidate.get(c.id) === v.id) continue;
      const e = evalOf(v.id, c.id);
      if (!e.feasible) continue;
      const currentVid = ofCandidate.get(c.id);
      const currentUtil = currentVid ? candidateUtility(evalOf(currentVid, c.id), weights) : -Infinity;
      if (candidateUtility(e, weights) > currentUtil && vacancyUtility(e, weights) > worstHeld) count++;
    }
  }
  return count;
}

function metricsOf(
  pairs: MatchPair[],
  vacancies: Vacancy[],
  candidates: Candidate[],
  evalOf: EvalLookup,
  weights: Weights,
  elapsedMs: number,
): AssignmentMetrics {
  const evals = pairs.map((p) => evalOf(p.vacancyId, p.candidateId));
  const totalScore = evals.reduce((s, e) => s + e.score, 0);
  const trips = evals.flatMap((e) => (e.commute ? [e.commute.minutes] : []));
  return {
    pairs: pairs.length,
    totalScore,
    meanScore: pairs.length ? totalScore / pairs.length : 0,
    meanCommuteMin: trips.length ? trips.reduce((a, b) => a + b, 0) / trips.length : null,
    filledSlots: pairs.length,
    totalSlots: vacancies.reduce((s, v) => s + v.slots, 0),
    unmatchedCandidates: candidates.length - new Set(pairs.map((p) => p.candidateId)).size,
    blockingPairs: countBlockingPairs(pairs, vacancies, candidates, evalOf, weights),
    elapsedMs,
  };
}
