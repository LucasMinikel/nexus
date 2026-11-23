/**
 * Contrato entre o experimento e o serviço Cloud Run.
 *
 * `runMatching` é a mesma função nos dois lados: o navegador a chama direto,
 * o servidor a chama depois de `parseMatchingRequest`. Por isso os resultados
 * dos dois modos precisam ser idênticos.
 */
import { CITY_KM, REGIONS, type RegionId } from '../city/city';
import type { CityMap } from '../city/map';
import { syntheticCity } from '../city/synthetic';
import { isTransit } from '../city/transit';
import { assign, type Algorithm, type AssignmentResult } from './assignment';
import type { Scenario } from './data';
import { evaluateAll, PathCache } from './engine';
import { DIMENSIONS, type Candidate, type Constraints, type Modality, type Shift, type Vacancy, type Weights } from './types';

export const ALGORITHMS: Algorithm[] = ['greedy', 'hungarian', 'stable'];

export interface MatchingRequest {
  /** Id da cidade (mapa em public/maps); ausente = cidade sintética. */
  city?: string;
  /** Deslocamento: pelas ruas (padrão) ou transporte público + a pé. */
  mode?: 'car' | 'transit';
  vacancies: Vacancy[];
  candidates: Candidate[];
  weights: Weights;
  constraints: Constraints;
}

export type MatchingResults = Record<Algorithm, AssignmentResult>;

export interface MatchingResponse {
  results: MatchingResults;
  server: ServerInfo;
}

export interface ServerInfo {
  /** Tempo de CPU gasto pelo servidor no cálculo, sem rede. */
  processingMs: number;
  /** true na primeira requisição atendida por esta instância. */
  coldStart: boolean;
  region: string;
  revision: string;
  instanceRequests: number;
}

/** O que o servidor aceita. Exibido no site para o visitante saber o que pode ser processado. */
export const LIMITS = {
  maxBodyBytes: 64 * 1024,
  maxVacancies: 60,
  maxCandidates: 200,
  maxSlots: 5,
  maxListItems: 10,
  maxString: 80,
  requestsPerMinute: 30,
} as const;

/** Um cache de caminhos por cidade, compartilhado por quem roda o cálculo no mesmo processo. */
const caches = new WeakMap<CityMap, PathCache>();
export function pathsFor(city: CityMap): PathCache {
  let c = caches.get(city);
  if (!c) {
    c = new PathCache(city);
    caches.set(city, c);
  }
  return c;
}
/** Rede e caminhos da cidade sintética (testes do Lab). */
export const network = syntheticCity().network;
export const paths = pathsFor(syntheticCity());

export function runMatching(req: MatchingRequest, city: CityMap = syntheticCity()): MatchingResults {
  if ((req.city ?? 'sintetica') !== city.id) throw new Error(`Cidade do pedido (${req.city}) diferente da carregada (${city.id})`);
  if ((req.mode ?? 'car') !== (isTransit(city) ? 'transit' : 'car')) throw new Error(`Modo do pedido (${req.mode ?? 'car'}) diferente do carregado`);
  const scenario: Scenario = { vacancies: req.vacancies, candidates: req.candidates };
  const { evalOf } = evaluateAll(scenario, pathsFor(city), req.weights, req.constraints);
  return Object.fromEntries(
    ALGORITHMS.map((a) => [a, assign(a, req.vacancies, req.candidates, evalOf, req.weights)]),
  ) as MatchingResults;
}

/** Igualdade dos pares alocados, ignorando tempos de execução. */
export function sameAssignments(a: MatchingResults, b: MatchingResults): boolean {
  const key = (r: AssignmentResult) => r.pairs.map((p) => `${p.vacancyId}|${p.candidateId}`).sort().join(',');
  return ALGORITHMS.every((alg) => key(a[alg]) === key(b[alg]));
}

export class ValidationError extends Error {}

const SHIFTS: Shift[] = ['manha', 'tarde', 'noite'];
const MODALITIES: Modality[] = ['presencial', 'hibrido', 'remoto'];
const REGION_IDS = Object.keys(REGIONS) as RegionId[];

function fail(path: string, why: string): never {
  throw new ValidationError(`${path}: ${why}`);
}

function obj(x: unknown, path: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) fail(path, 'objeto esperado');
  return x as Record<string, unknown>;
}

function str(x: unknown, path: string): string {
  if (typeof x !== 'string' || x.length === 0 || x.length > LIMITS.maxString) fail(path, `texto de 1 a ${LIMITS.maxString} caracteres`);
  return x;
}

function num(x: unknown, path: string, min: number, max: number): number {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) fail(path, `número entre ${min} e ${max}`);
  return x;
}

function bool(x: unknown, path: string): boolean {
  if (typeof x !== 'boolean') fail(path, 'booleano esperado');
  return x;
}

function list<T>(x: unknown, path: string, item: (v: unknown, p: string) => T, max: number = LIMITS.maxListItems, min = 0): T[] {
  if (!Array.isArray(x) || x.length < min || x.length > max) fail(path, `lista de ${min} a ${max} itens`);
  return x.map((v, i) => item(v, `${path}[${i}]`));
}

function oneOf<T extends string>(values: readonly T[]) {
  return (x: unknown, path: string): T => {
    if (!values.includes(x as T)) fail(path, `um de ${values.join(', ')}`);
    return x as T;
  };
}

function point(x: unknown, path: string) {
  const o = obj(x, path);
  return { x: num(o.x, `${path}.x`, 0, CITY_KM), y: num(o.y, `${path}.y`, 0, CITY_KM) };
}

function vacancy(x: unknown, path: string): Vacancy {
  const o = obj(x, path);
  return {
    id: str(o.id, `${path}.id`),
    title: str(o.title, `${path}.title`),
    company: str(o.company, `${path}.company`),
    pos: point(o.pos, `${path}.pos`),
    area: str(o.area, `${path}.area`),
    courses: list(o.courses, `${path}.courses`, str, LIMITS.maxListItems, 1),
    skills: list(o.skills, `${path}.skills`, str),
    shifts: list(o.shifts, `${path}.shifts`, oneOf(SHIFTS), 3, 1),
    modality: oneOf(MODALITIES)(o.modality, `${path}.modality`),
    stipend: num(o.stipend, `${path}.stipend`, 0, 100_000),
    benefits: list(o.benefits, `${path}.benefits`, str),
    fares: num(o.fares, `${path}.fares`, 0, 12),
    slots: num(o.slots, `${path}.slots`, 1, LIMITS.maxSlots),
  };
}

function candidate(x: unknown, path: string): Candidate {
  const o = obj(x, path);
  return {
    id: str(o.id, `${path}.id`),
    name: str(o.name, `${path}.name`),
    pos: point(o.pos, `${path}.pos`),
    preferredRegions: list(o.preferredRegions, `${path}.preferredRegions`, oneOf(REGION_IDS), REGION_IDS.length),
    course: str(o.course, `${path}.course`),
    skills: list(o.skills, `${path}.skills`, str),
    availability: list(o.availability, `${path}.availability`, oneOf(SHIFTS), 3, 1),
    maxCommuteMin: num(o.maxCommuteMin, `${path}.maxCommuteMin`, 1, 240),
    modalities: list(o.modalities, `${path}.modalities`, oneOf(MODALITIES), 3, 1),
    desiredStipend: num(o.desiredStipend, `${path}.desiredStipend`, 1, 100_000),
    interests: list(o.interests, `${path}.interests`, str),
  };
}

/** Valida e copia apenas os campos conhecidos; qualquer outra coisa é rejeitada ou descartada. */
export function parseMatchingRequest(body: unknown): MatchingRequest {
  const o = obj(body, 'body');
  const vacancies = list(o.vacancies, 'vacancies', vacancy, LIMITS.maxVacancies);
  const candidates = list(o.candidates, 'candidates', candidate, LIMITS.maxCandidates);
  const w = obj(o.weights, 'weights');
  const weights = Object.fromEntries(DIMENSIONS.map((d) => [d, num(w[d], `weights.${d}`, 0, 10)])) as Weights;
  const c = obj(o.constraints, 'constraints');
  const constraints: Constraints = {
    modality: bool(c.modality, 'constraints.modality'),
    course: bool(c.course, 'constraints.course'),
    schedule: bool(c.schedule, 'constraints.schedule'),
    commute: bool(c.commute, 'constraints.commute'),
    // Opcional: pedidos anteriores às conduções continuam valendo.
    fares: c.fares === undefined ? true : bool(c.fares, 'constraints.fares'),
  };
  const ids = [...vacancies, ...candidates].map((e) => e.id);
  if (new Set(ids).size !== ids.length) fail('ids', 'ids precisam ser únicos');
  let city: string | undefined;
  if (o.city !== undefined) {
    city = str(o.city, 'city');
    if (!/^[a-z-]{2,40}$/.test(city)) fail('city', 'id de cidade inválido');
  }
  const mode = o.mode === undefined ? undefined : oneOf(['car', 'transit'] as const)(o.mode, 'mode');
  return { ...(city ? { city } : {}), ...(mode ? { mode } : {}), vacancies, candidates, weights, constraints };
}
