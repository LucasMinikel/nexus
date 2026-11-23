import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { commute, dijkstra, regionOf, straightKm } from './city';
import { geoKm, nearestCity, parseCityMap, type CityMapFile } from './map';
import { makeScenario } from '../matching/data';
import { runMatching } from '../matching/api';

const file = JSON.parse(readFileSync('public/maps/curitiba.json', 'utf8')) as CityMapFile;
const city = parseCityMap(file);

describe('mapa real (Curitiba, OpenStreetMap)', () => {
  it('todas as arestas ligam vértices existentes e têm comprimento ≥ a reta entre as pontas', () => {
    const n = file.n.length / 2;
    city.network.segments.forEach((s, i) => {
      expect(s.a).toBeLessThan(n);
      expect(s.b).toBeLessThan(n);
      const km = city.network.adjacency[s.a].find((e) => e.to === s.b)!.km;
      expect(km + 0.002).toBeGreaterThanOrEqual(straightKm(city.point(s.a), city.point(s.b)));
      expect(city.segmentClass[i]).toBeLessThanOrEqual(5);
    });
  });

  it('a rede é conectada: do centro se chega a todos os vértices', () => {
    const sp = dijkstra(city.network, city.nearest({ x: 5, y: 5 }));
    expect([...sp.minutes].every(Number.isFinite)).toBe(true);
  });

  it('nearest acha o mesmo vértice que a busca exaustiva', () => {
    const n = file.n.length / 2;
    for (const p of [{ x: 0.1, y: 0.1 }, { x: 5, y: 5 }, { x: 9.9, y: 3.3 }, { x: 2.2, y: 8.7 }]) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const d = (city.point(i).x - p.x) ** 2 + (city.point(i).y - p.y) ** 2;
        if (d < bestD) [best, bestD] = [i, d];
      }
      expect(city.nearest(p)).toBe(best);
    }
  });

  it('cenário: todos perto de uma rua, dentro do mapa, e o deslocamento pela rede nunca é menor que a reta', () => {
    const s = makeScenario(7, 12, 40, city);
    for (const e of [...s.vacancies, ...s.candidates]) {
      expect(e.pos.x).toBeGreaterThanOrEqual(0);
      expect(e.pos.x).toBeLessThanOrEqual(city.km);
      expect(straightKm(e.pos, city.point(city.nearest(e.pos)))).toBeLessThanOrEqual(0.041);
      expect(regionOf(e.pos, city)).toMatch(/^[NCS][OL]$/);
    }
    const v = s.vacancies[0];
    const sp = dijkstra(city.network, city.nearest(v.pos));
    for (const c of s.candidates) {
      const t = commute(c.pos, v.pos, sp, city);
      expect(t.networkKm + 1e-9).toBeGreaterThanOrEqual(t.straightKm);
    }
  });

  it('é determinístico e o pedido precisa ser da cidade carregada', () => {
    expect(makeScenario(42, 5, 10, city)).toEqual(makeScenario(42, 5, 10, city));
    const s = makeScenario(7, 12, 40, city);
    const req = { city: 'curitiba', ...s, weights: { geo: 3, professional: 3, education: 2, schedule: 1, preferences: 1 }, constraints: { modality: true, course: true, schedule: true, commute: true, fares: true } };
    expect(runMatching(req, city).hungarian.pairs.length).toBeGreaterThan(0);
    expect(() => runMatching({ ...req, city: 'maceio' }, city)).toThrow();
  });
});

describe('cidade mais próxima', () => {
  const cities = [
    { id: 'curitiba', lat: -25.4284, lon: -49.2733 },
    { id: 'sao-paulo', lat: -23.5505, lon: -46.6333 },
  ];
  it('haversine: Curitiba–São Paulo ≈ 340 km', () => {
    expect(geoKm(cities[0], cities[1])).toBeGreaterThan(320);
    expect(geoKm(cities[0], cities[1])).toBeLessThan(360);
  });
  it('Ponta Grossa cai em Curitiba; Campinas em São Paulo', () => {
    expect(nearestCity(cities, { lat: -25.095, lon: -50.162 }).city.id).toBe('curitiba');
    expect(nearestCity(cities, { lat: -22.906, lon: -47.061 }).city.id).toBe('sao-paulo');
  });
});
