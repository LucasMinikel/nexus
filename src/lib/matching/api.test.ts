import { describe, expect, it } from 'vitest';
import { LIMITS, parseMatchingRequest, runMatching, sameAssignments, ValidationError, type MatchingRequest } from './api';
import { makeScenario } from './data';

const base = (): MatchingRequest => ({
  ...makeScenario(7, 12, 40),
  weights: { geo: 3, professional: 3, education: 2, schedule: 1, preferences: 1 },
  constraints: { modality: true, course: true, schedule: true, commute: true, fares: true },
});

describe('parseMatchingRequest', () => {
  it('aceita o cenário gerado pelo próprio site', () => {
    const req = base();
    expect(parseMatchingRequest(JSON.parse(JSON.stringify(req)))).toEqual(req);
  });

  it('descarta campos desconhecidos', () => {
    const req = base() as unknown as Record<string, unknown>;
    req.audio = 'base64...';
    (req.vacancies as Record<string, unknown>[])[0].script = '<script>';
    const parsed = parseMatchingRequest(req) as unknown as Record<string, unknown>;
    expect(parsed.audio).toBeUndefined();
    expect((parsed.vacancies as Record<string, unknown>[])[0].script).toBeUndefined();
  });

  it.each([
    ['vagas demais', (r: MatchingRequest) => (r.vacancies = Array.from({ length: LIMITS.maxVacancies + 1 }, (_, i) => ({ ...r.vacancies[0], id: `X${i}` })))],
    ['modalidade inexistente', (r: MatchingRequest) => ((r.vacancies[0] as { modality: string }).modality = 'teleporte')],
    ['coordenada fora da cidade', (r: MatchingRequest) => (r.candidates[0].pos = { x: -5, y: 1 })],
    ['peso não numérico', (r: MatchingRequest) => ((r.weights as unknown as Record<string, unknown>).geo = '3')],
    ['ids repetidos', (r: MatchingRequest) => (r.candidates[1].id = r.candidates[0].id)],
    ['texto longo', (r: MatchingRequest) => (r.candidates[0].name = 'a'.repeat(LIMITS.maxString + 1))],
  ])('rejeita %s', (_, mutate) => {
    const r = base();
    mutate(r);
    expect(() => parseMatchingRequest(r)).toThrow(ValidationError);
  });
});

describe('runMatching', () => {
  it('resultado após ida e volta em JSON (modo nuvem) é idêntico ao local', () => {
    const req = base();
    const local = runMatching(req);
    const remote = JSON.parse(JSON.stringify(runMatching(parseMatchingRequest(JSON.parse(JSON.stringify(req))))));
    expect(sameAssignments(local, remote)).toBe(true);
  });
});
