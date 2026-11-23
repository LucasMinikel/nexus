/**
 * Teste do Lab: maximizar o score total gera uma alocação estável?
 *
 * Cada rodada gera um cenário, roda o mesmo cálculo do projeto Vagas e Candidatos
 * e compara o Hungarian (máximo score) com o Gale–Shapley (estável).
 */
import { runMatching } from '../matching/api';
import { makeScenario } from '../matching/data';
import type { Constraints, Weights } from '../matching/types';

export const WEIGHTS: Weights = { geo: 3, professional: 3, education: 2, schedule: 1, preferences: 1 };
export const CONSTRAINTS: Constraints = { modality: true, course: true, schedule: true, commute: true, fares: true };

export interface StabilityTrial {
  seed: number;
  /** Pares bloqueantes deixados pelo Hungarian. */
  hungarianBlocking: number;
  stableBlocking: number;
  /** Score que o Gale–Shapley perde em relação ao Hungarian, em %. */
  scoreLossPct: number;
}

export function stabilityTrial(seed: number, vacancies: number, candidates: number): StabilityTrial {
  const r = runMatching({ ...makeScenario(seed, vacancies, candidates), weights: WEIGHTS, constraints: CONSTRAINTS });
  const h = r.hungarian.metrics;
  const s = r.stable.metrics;
  return {
    seed,
    hungarianBlocking: h.blockingPairs,
    stableBlocking: s.blockingPairs,
    scoreLossPct: h.totalScore > 0 ? ((h.totalScore - s.totalScore) / h.totalScore) * 100 : 0,
  };
}

export interface StabilitySummary {
  trials: number;
  /** % de cenários em que o Hungarian deixou ao menos um par bloqueante. */
  unstablePct: number;
  meanBlocking: number;
  meanLossPct: number;
  maxLossPct: number;
  verdict: 'confirmada' | 'refutada' | 'inconclusiva';
}

/** Regra do veredito: confirmada se o Hungarian é instável na maioria dos cenários e o estável perde até 10% de score. */
export const RULE = { unstablePct: 50, maxMeanLossPct: 10, minTrials: 30 };

export function summarize(trials: StabilityTrial[]): StabilitySummary {
  const n = trials.length;
  const mean = (f: (t: StabilityTrial) => number) => (n ? trials.reduce((s, t) => s + f(t), 0) / n : 0);
  const unstablePct = n ? (trials.filter((t) => t.hungarianBlocking > 0).length / n) * 100 : 0;
  const meanLossPct = mean((t) => t.scoreLossPct);
  const verdict =
    n < RULE.minTrials
      ? 'inconclusiva'
      : unstablePct >= RULE.unstablePct && meanLossPct <= RULE.maxMeanLossPct
        ? 'confirmada'
        : 'refutada';
  return {
    trials: n,
    unstablePct,
    meanBlocking: mean((t) => t.hungarianBlocking),
    meanLossPct,
    maxLossPct: Math.max(0, ...trials.map((t) => t.scoreLossPct)),
    verdict,
  };
}
