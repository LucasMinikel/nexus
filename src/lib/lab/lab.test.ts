import { describe, expect, it } from 'vitest';
import { CITY_KM, RIVER_X } from '../city/city';
import { network } from '../matching/api';
import { rng } from '../random';
import { fitLine, pearson, randomTrip, summarizeTrips, trip } from './detour';
import { stabilityTrial, summarize } from './stability';

describe('teste de estabilidade', () => {
  it('Gale–Shapley nunca deixa pares bloqueantes', () => {
    for (let seed = 1; seed <= 10; seed++) expect(stabilityTrial(seed, 12, 40).stableBlocking).toBe(0);
  });

  it('reproduz a medição registrada no rascunho da tese (seeds 1–200)', () => {
    const s = summarize(Array.from({ length: 200 }, (_, i) => stabilityTrial(i + 1, 12, 40)));
    expect(s.unstablePct).toBe(87);
    expect(s.meanBlocking).toBeCloseTo(2.42, 2);
    expect(s.meanLossPct).toBeCloseTo(5.0, 1);
    expect(s.verdict).toBe('confirmada');
  });

  it('sem cenários suficientes o veredito é inconclusivo', () => {
    expect(summarize([stabilityTrial(1, 12, 40)]).verdict).toBe('inconclusiva');
  });
});

describe('teste da linha reta', () => {
  it('regressão e correlação em dados exatos', () => {
    expect(fitLine([0, 1, 2], [1, 3, 5])).toEqual({ slope: 2, intercept: 1 });
    expect(pearson([0, 1, 2], [1, 3, 5])).toBeCloseTo(1, 10);
  });

  it('pela rua nunca é mais curto que a linha reta', () => {
    const r = rng(3);
    for (let i = 0; i < 50; i++) {
      const t = randomTrip(network, r);
      expect(t.networkKm).toBeGreaterThanOrEqual(t.straightKm - 1e-9);
    }
  });

  it('marca quem cruza o rio', () => {
    const t = trip(network, { x: 1, y: 5 }, { x: CITY_KM - 1, y: 5 });
    expect(t.crossesRiver).toBe(true);
    expect(trip(network, { x: RIVER_X + 1, y: 1 }, { x: CITY_KM - 1, y: 9 }).crossesRiver).toBe(false);
  });

  it('veredito é determinístico pelo seed', () => {
    const run = () => {
      const r = rng(1);
      return summarizeTrips(Array.from({ length: 300 }, () => randomTrip(network, r)));
    };
    expect(run()).toEqual(run());
  });
});
