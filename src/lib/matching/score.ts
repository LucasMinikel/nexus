import { commute, regionOf, REGIONS, type ShortestPaths } from '../city/city';
import type { CityMap } from '../city/map';
import { syntheticCity } from '../city/synthetic';
import {
  CONSTRAINT_LABEL,
  DIMENSIONS,
  MODALITY_LABEL,
  type Candidate,
  type Constraints,
  type Dimension,
  type DimensionScore,
  type PairEvaluation,
  type Vacancy,
  type Weights,
} from './types';

const fmt = (n: number) => n.toFixed(0);

/**
 * Avalia um par (vaga, candidato).
 *
 * Score = Σ wᵢ·sᵢ / Σ wᵢ, com sᵢ ∈ [0, 1]. Restrições obrigatórias são
 * verificadas antes e tornam o par inviável independentemente do score.
 *
 * `paths` é o resultado do Dijkstra a partir do nó da vaga.
 */
export function evaluatePair(
  v: Vacancy,
  c: Candidate,
  paths: ShortestPaths,
  weights: Weights,
  constraints: Constraints,
  city: CityMap = syntheticCity(),
): PairEvaluation {
  const fastest = v.modality === 'remoto' ? null : commute(c.pos, v.pos, paths, city);
  const fares = fastest?.rides !== undefined ? faresNeeded(v, c, paths, city) : null;
  // Com a restrição ativa, o candidato só usa as conduções que a vaga paga (pode demorar mais).
  const trip = fares && constraints.fares ? commute(c.pos, v.pos, paths, city, fares.paid / 2) : fastest;
  const faresShort = !!fares && (fares.need === null || fares.need > fares.paid);
  const violations: string[] = [];

  if (constraints.modality && !c.modalities.includes(v.modality)) {
    violations.push(`${CONSTRAINT_LABEL.modality}: vaga ${MODALITY_LABEL[v.modality].toLowerCase()}`);
  }
  if (constraints.course && !v.courses.includes(c.course)) {
    violations.push(`${CONSTRAINT_LABEL.course}: ${c.course} não está entre os aceitos`);
  }
  const coveredShifts = v.shifts.filter((s) => c.availability.includes(s));
  if (constraints.schedule && coveredShifts.length < v.shifts.length) {
    violations.push(`${CONSTRAINT_LABEL.schedule}: cobre ${coveredShifts.length} de ${v.shifts.length}`);
  }
  // Se o problema é só faltar condução (com mais conduções chegaria a tempo), diz isso em vez do tempo.
  const onlyFares = constraints.fares && faresShort && fares?.need !== null;
  if (constraints.commute && trip && trip.minutes > c.maxCommuteMin && !onlyFares) {
    violations.push(`${CONSTRAINT_LABEL.commute}: ${fmt(trip.minutes)} min > ${c.maxCommuteMin} min`);
  }
  if (constraints.fares && fares && onlyFares) {
    violations.push(`${CONSTRAINT_LABEL.fares}: precisa de ${fares.need} por dia, a vaga paga ${fares.paid}`);
  }

  const dims: Record<Dimension, DimensionScore> = {
    geo: geoScore(v, c, trip),
    professional: professionalScore(v, c),
    education: educationScore(v, c),
    schedule: {
      value: coveredShifts.length / v.shifts.length,
      detail: `Cobre ${coveredShifts.length} de ${v.shifts.length} turno(s)`,
    },
    preferences: preferencesScore(v, c, city),
  };

  const totalWeight = DIMENSIONS.reduce((s, d) => s + weights[d], 0);
  const contributions = {} as Record<Dimension, number>;
  let score = 0;
  for (const d of DIMENSIONS) {
    contributions[d] = totalWeight > 0 ? (weights[d] * dims[d].value) / totalWeight : 0;
    score += contributions[d];
  }

  return {
    vacancyId: v.id,
    candidateId: c.id,
    feasible: violations.length === 0,
    violations,
    dims,
    contributions,
    score,
    commute: trip,
    fares,
  };
}

/**
 * Conduções por dia (ida e volta, supondo a volta igual à ida) que o candidato precisa para chegar
 * dentro do tempo máximo dele: o menor número de embarques por sentido que cabe no tempo, vezes 2.
 */
function faresNeeded(v: Vacancy, c: Candidate, paths: ShortestPaths, city: CityMap): NonNullable<PairEvaluation['fares']> {
  const max = paths.rides?.maxRides ?? 0;
  let need: number | null = null;
  for (let k = 0; k <= max && need === null; k++) {
    if (commute(c.pos, v.pos, paths, city, k).minutes <= c.maxCommuteMin) need = 2 * k;
  }
  return { need, paid: v.fares };
}

function geoScore(v: Vacancy, c: Candidate, trip: PairEvaluation['commute']): DimensionScore {
  if (!trip) return { value: 1, detail: 'Vaga remota: sem deslocamento' };
  // Híbrido: deslocamento em parte dos dias, penaliza pela metade.
  const factor = v.modality === 'hibrido' ? 0.5 : 1;
  const value = Math.max(0, 1 - (factor * trip.minutes) / c.maxCommuteMin);
  return {
    value,
    detail:
      `${fmt(trip.minutes)} min (${trip.networkKm.toFixed(1)} km pelo caminho; ${trip.straightKm.toFixed(1)} km em linha reta) · máx. ${c.maxCommuteMin} min` +
      (trip.rides !== undefined ? ` · ${trip.rides} condução(ões) por sentido` : ''),
  };
}

function professionalScore(v: Vacancy, c: Candidate): DimensionScore {
  if (v.skills.length === 0) return { value: 1, detail: 'Vaga sem competências exigidas' };
  const has = v.skills.filter((s) => c.skills.includes(s));
  return {
    value: has.length / v.skills.length,
    detail: `${has.length}/${v.skills.length} competências: ${has.join(', ') || 'nenhuma'}`,
  };
}

function educationScore(v: Vacancy, c: Candidate): DimensionScore {
  if (v.courses[0] === c.course) return { value: 1, detail: `${c.course} é o curso principal da vaga` };
  if (v.courses.includes(c.course)) return { value: 0.7, detail: `${c.course} é aceito pela vaga` };
  return { value: 0, detail: `${c.course} não é aceito pela vaga` };
}

function preferencesScore(v: Vacancy, c: Candidate, city: CityMap): DimensionScore {
  const region = regionOf(v.pos, city);
  const regionOk = v.modality === 'remoto' || c.preferredRegions.includes(region);
  const stipendRatio = Math.min(1, v.stipend / c.desiredStipend);
  const areaOk = c.interests.includes(v.area);
  const value = ((regionOk ? 1 : 0) + stipendRatio + (areaOk ? 1 : 0)) / 3;
  const parts = [
    regionOk ? `região ${REGIONS[region]} preferida` : `região ${REGIONS[region]} não preferida`,
    `bolsa ${Math.round(stipendRatio * 100)}% da desejada`,
    areaOk ? `interesse em ${v.area}` : `sem interesse declarado em ${v.area}`,
  ];
  return { value, detail: parts.join(' · ') };
}

/**
 * Utilidades usadas pelo matching estável: cada lado ordena o outro pelos
 * critérios que lhe importam, usando os mesmos pesos configurados.
 */
export function candidateUtility(e: PairEvaluation, w: Weights): number {
  return (w.geo * e.dims.geo.value + w.preferences * e.dims.preferences.value) / Math.max(1e-9, w.geo + w.preferences);
}

export function vacancyUtility(e: PairEvaluation, w: Weights): number {
  const total = w.professional + w.education + w.schedule;
  return (
    (w.professional * e.dims.professional.value + w.education * e.dims.education.value + w.schedule * e.dims.schedule.value) /
    Math.max(1e-9, total)
  );
}
