import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { commute, dijkstra, straightKm, SPEED_KMH } from './city';
import { parseCityMap, type CityMapFile } from './map';
import { MAX_RIDES, MODE_INFO, parseTransit, tripLegs, withTransit, type TransitFile } from './transit';
import { makeScenario } from '../matching/data';
import { runMatching } from '../matching/api';
import { evaluatePair } from '../matching/score';

const base = parseCityMap(JSON.parse(readFileSync('public/maps/curitiba.json', 'utf8')) as CityMapFile);
const city = withTransit(base, parseTransit(JSON.parse(readFileSync('public/maps/curitiba.transit.json', 'utf8')) as TransitFile));
const scenario = makeScenario(7, 12, 40, base);
const weights = { geo: 3, professional: 3, education: 2, schedule: 1, preferences: 1 };
const constraints = { modality: true, course: true, schedule: true, commute: true, fares: true };

describe('transporte público (Curitiba, OpenStreetMap)', () => {
  it('tem linhas e todas as paradas dentro do mapa', () => {
    expect(city.lines.length).toBeGreaterThan(50);
    for (const l of city.lines) for (const p of l.stops) expect(p.x >= 0 && p.x <= city.km && p.y >= 0 && p.y <= city.km).toBe(true);
  });

  it('nunca é mais lento que ir a pé pelas ruas, e longe compensa pegar a linha', () => {
    const v = scenario.vacancies[0];
    const sp = dijkstra(city.network, city.nearest(v.pos), MAX_RIDES);
    const walkOnly = dijkstra({ adjacency: base.network.adjacency.map((es) => es.map((e) => ({ ...e, minutes: (e.km / SPEED_KMH.walk) * 60 }))), segments: base.network.segments }, base.nearest(v.pos));
    let rides = 0;
    for (const c of scenario.candidates) {
      const start = city.nearest(c.pos);
      expect(sp.minutes[start]).toBeLessThanOrEqual(walkOnly.minutes[start] + 1e-6);
      const t = commute(c.pos, v.pos, sp, city);
      const legs = tripLegs(city, t.path, t.along!);
      if (legs.some((l) => l.kind === 'ride')) rides++;
    }
    expect(rides).toBeGreaterThan(10);
  });

  it('os trechos somam o tempo da viagem (a pé + espera + veículo)', () => {
    const v = scenario.vacancies[0];
    const sp = dijkstra(city.network, city.nearest(v.pos), MAX_RIDES);
    for (const c of scenario.candidates.slice(0, 15)) {
      const start = city.nearest(c.pos);
      const t = commute(c.pos, v.pos, sp, city);
      const legs = tripLegs(city, t.path, t.along!);
      const sum = legs.reduce((n, l) => n + l.minutes + (l.kind === 'ride' ? l.waitMin : 0), 0);
      // Diferença só da caminhada curta entre a esquina e a parada (embarque e desembarque).
      expect(Math.abs(sum - sp.minutes[start])).toBeLessThan(6);
      for (const l of legs) if (l.kind === 'ride') expect(l.waitMin).toBe(MODE_INFO[l.mode].waitMin);
    }
  });

  it('conta as conduções: cada embarque é uma, e limitar nunca deixa a viagem mais rápida', () => {
    const v = scenario.vacancies[0];
    const sp = dijkstra(city.network, city.nearest(v.pos), MAX_RIDES);
    for (const c of scenario.candidates) {
      const free = commute(c.pos, v.pos, sp, city);
      const legs = tripLegs(city, free.path, free.along!);
      expect(free.rides).toBe(legs.filter((l) => l.kind === 'ride').length);
      let last = Infinity;
      for (let k = 0; k <= MAX_RIDES; k++) {
        const t = commute(c.pos, v.pos, sp, city, k);
        expect(t.rides).toBeLessThanOrEqual(k);
        expect(t.minutes).toBeLessThanOrEqual(last + 1e-9); // mais conduções permitidas: igual ou mais rápido
        expect(t.minutes).toBeGreaterThanOrEqual(free.minutes - 1e-9);
        last = t.minutes;
      }
    }
  });

  it('vaga que paga menos conduções do que o candidato precisa fica fora, e o motivo é a condução', () => {
    const loose = { ...constraints, course: false, schedule: false };
    const people = scenario.candidates.map((c) => ({ ...c, modalities: ['presencial' as const] }));
    let needy: { v: (typeof scenario.vacancies)[number]; sp: ReturnType<typeof dijkstra>; c: (typeof people)[number]; e: ReturnType<typeof evaluatePair> } | undefined;
    for (const base of scenario.vacancies) {
      const v = { ...base, modality: 'presencial' as const };
      const sp = dijkstra(city.network, city.nearest(v.pos), MAX_RIDES);
      for (const c of people) {
        const e = evaluatePair({ ...v, fares: 6 }, c, sp, weights, loose, city);
        if ((e.fares?.need ?? 0) >= 4) needy ??= { v, sp, c, e };
      }
    }
    expect(needy).toBeDefined();
    const { v, sp, c, e } = needy!;
    expect(e.feasible).toBe(true);
    const short = evaluatePair({ ...v, fares: 2 }, c, sp, weights, loose, city);
    expect(short.feasible).toBe(false);
    expect(short.violations.join(' ')).toMatch(/precisa de \d por dia, a vaga paga 2/);
    // Sem a restrição, o par volta a ser viável (a condução só aparece na explicação).
    expect(evaluatePair({ ...v, fares: 2 }, c, sp, weights, { ...loose, fares: false }, city).feasible).toBe(true);
  });

  it('o pedido diz o modo e precisa bater com a rede carregada', () => {
    const req = { city: 'curitiba', mode: 'transit' as const, ...scenario, weights, constraints };
    const r = runMatching(req, city);
    expect(r.hungarian.metrics.totalSlots).toBeGreaterThan(0);
    expect(() => runMatching({ ...req, mode: 'car' }, city)).toThrow();
    expect(() => runMatching(req, base)).toThrow();
    // De carro, nas mesmas ruas, o deslocamento médio é menor que de transporte público.
    const car = runMatching({ ...req, mode: 'car' }, base);
    expect(car.hungarian.metrics.meanCommuteMin ?? 0).toBeLessThanOrEqual((r.hungarian.metrics.meanCommuteMin ?? 0) + 10);
    expect(straightKm(scenario.candidates[0].pos, scenario.vacancies[0].pos)).toBeGreaterThan(0);
  });
});
