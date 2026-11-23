import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCityMap, type CityMapFile } from '../city/map';
import { makeScenario } from './data';
import { PathCache } from './engine';
import { HEX_KM, hexGrid, hexOf, opportunityMap } from './opportunity';

const city = parseCityMap(JSON.parse(readFileSync('public/maps/curitiba.json', 'utf8')) as CityMapFile);
const scenario = makeScenario(7, 12, 40, city);
const hexes = hexGrid(city);
const paths = new PathCache(city);
const base = { city, paths, hexes, vacancies: scenario.vacancies, candidates: scenario.candidates, open: (v: { slots: number }) => v.slots, limitFares: false, stranded: new Set<string>() };

describe('mapa de oportunidades', () => {
  it('a grade cobre quem está no mapa: cada pessoa e cada vaga cai a menos de um raio de um centro', () => {
    expect(hexes.length).toBeGreaterThan(100);
    for (const p of [...scenario.candidates.map((c) => c.pos), ...scenario.vacancies.map((v) => v.pos)]) {
      const hx = hexes[hexOf(hexes, p)];
      expect(Math.hypot(hx.center.x - p.x, hx.center.y - p.y)).toBeLessThanOrEqual(HEX_KM + 1e-9);
    }
  });

  it('mais tempo nunca diminui o acesso, e todo morador é contado uma vez', () => {
    const short = opportunityMap({ ...base, minutes: 10 });
    const long = opportunityMap({ ...base, minutes: 30 });
    for (let i = 0; i < hexes.length; i++) expect(long[i].slots).toBeGreaterThanOrEqual(short[i].slots);
    expect(long.reduce((n, s) => n + s.residents, 0)).toBe(scenario.candidates.length);
    expect(long.reduce((n, s) => n + s.slots, 0)).toBeGreaterThan(short.reduce((n, s) => n + s.slots, 0));
  });

  it('o hexágono da vaga alcança a própria vaga; remotas e vagas cheias não contam', () => {
    const v = scenario.vacancies.find((x) => x.modality !== 'remoto')!;
    const stats = opportunityMap({ ...base, minutes: 15 });
    expect(stats[hexOf(hexes, v.pos)].vacancies).toContain(v.id);
    const remote = scenario.vacancies.filter((x) => x.modality === 'remoto').map((x) => x.id);
    for (const s of stats) for (const id of remote) expect(s.vacancies).not.toContain(id);
    const full = opportunityMap({ ...base, minutes: 60, open: () => 0 });
    expect(full.every((s) => s.slots === 0)).toBe(true);
  });
});
