import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Heading, HeadingLevel } from './heading';
import { REGIONS, regionOf, SPEED_KMH, straightKm, type Point, type RegionId } from '../../lib/city/city';
import type { CityMap } from '../../lib/city/map';
import { isTransit, MAX_RIDES, MODE_INFO, tripLegs, type Leg, type TransitMode } from '../../lib/city/transit';
import { ALGORITHMS, pathsFor, type MatchingRequest } from '../../lib/matching/api';
import { ALGORITHM_INFO, type Algorithm, type MatchPair } from '../../lib/matching/assignment';
import { makeCandidate, makeScenario, makeVacancy, regionalBalance, rng, type Scenario } from '../../lib/matching/data';
import { evaluateAll } from '../../lib/matching/engine';
import {
  CONSTRAINT_LABEL,
  DIMENSION_LABEL,
  DIMENSIONS,
  MODALITY_LABEL,
  SHIFT_LABEL,
  type Candidate,
  type Constraints,
  type Dimension,
  type PairEvaluation,
  type Vacancy,
  type Weights,
} from '../../lib/matching/types';
import ExecutionPanel from './ExecutionPanel';
import TerritoryMap, { type Flight, type PersonLook, type VacancyLook } from './TerritoryMap';
import { useExecution, type Target } from './useExecution';
import './VacancyMatchingLab.css';

const DIM_COLOR: Record<Dimension, string> = {
  geo: '#3fd0ff',
  professional: '#b98bff',
  education: '#3fe0b0',
  schedule: '#ffb03a',
  preferences: '#ff3d8b',
};

const DEFAULT_WEIGHTS: Weights = { geo: 3, professional: 3, education: 2, schedule: 1, preferences: 1 };
const DEFAULT_CONSTRAINTS: Constraints = { modality: true, course: true, schedule: true, commute: true, fares: true };

type Selection = { kind: 'vacancy' | 'candidate'; id: string } | null;
type ClickMode = 'select' | 'add-vacancy' | 'add-candidate';

/** Abre a demo na vaga com mais candidatos viáveis, para o ranking inicial não vir vazio. */
function initialSelection(s: Scenario, city: CityMap): Selection {
  const { evalOf } = evaluateAll(s, pathsFor(city), DEFAULT_WEIGHTS, DEFAULT_CONSTRAINTS);
  const count = (vid: string) => s.candidates.filter((c) => evalOf(vid, c.id).feasible).length;
  const best = [...s.vacancies].sort((a, b) => count(b.id) - count(a.id))[0];
  return best ? { kind: 'vacancy', id: best.id } : null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Número com vírgula decimal (pt-BR). */
const num = (x: number, d: number) => x.toFixed(d).replace('.', ',');
/** Tempos abaixo da resolução mostrada viram “<0,1 ms”, não “0,0 ms”. */
const msText = (x: number) => (x < 0.05 ? '<0,1 ms' : `${num(x, 1)} ms`);
const pairKey = (p: MatchPair) => `${p.vacancyId}|${p.candidateId}`;
const pts = (list: Point[]) => list.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
const pathD = (list: Point[]) => 'M' + pts(list).replace(/ /g, 'L');

/** Desenho das ruas: um <path> por classe de via (milhares de trechos, poucos elementos). */
function roadPaths(city: CityMap): string[] {
  const out: string[][] = [[], [], [], [], [], []];
  city.network.segments.forEach((s, i) => {
    out[city.segmentClass[i]].push(pathD([city.point(s.a), ...city.segmentShape[i], city.point(s.b)]));
  });
  return out.map((d) => d.join(''));
}

/** Rota pelos nós do caminho, seguindo a forma real de cada trecho. */
function routePoints(city: CityMap, path: number[]): Point[] {
  const shape = new Map<string, Point[]>();
  city.network.segments.forEach((s, i) => {
    shape.set(`${s.a}-${s.b}`, city.segmentShape[i]);
    shape.set(`${s.b}-${s.a}`, [...city.segmentShape[i]].reverse());
  });
  const out: Point[] = [];
  path.forEach((n, k) => {
    if (k > 0) out.push(...(shape.get(`${path[k - 1]}-${n}`) ?? []));
    out.push(city.point(n));
  });
  return out;
}

/** Cor de cada modo de transporte no mapa e na rota. */
const MODE_COLOR: Record<TransitMode, string> = {
  bus: 'var(--info)',
  trolleybus: 'var(--info)',
  tram: 'var(--kind-test)',
  light_rail: 'var(--kind-test)',
  monorail: 'var(--kind-test)',
  subway: 'var(--signal)',
  train: 'var(--sun)',
};

/** Trajeto em palavras: "6 min a pé → Ônibus 216 (espera ~8 min, 5 paradas, 9 min) → 3 min a pé". */
function legsText(legs: Leg[]): string {
  return legs
    .map((l) =>
      l.kind === 'walk'
        ? `${num(l.minutes, 0)} min a pé`
        : `${MODE_INFO[l.mode].label} ${l.ref || l.name} (espera ~${l.waitMin} min, ${l.stops} parada${l.stops === 1 ? '' : 's'}, ${num(l.minutes, 0)} min)`,
    )
    .join(' → ');
}

/** Situação da oferta de uma vaga a uma pessoa. */
type OfferState = 'ofertada' | 'aceita' | 'recusada';
type PersonStatus = 'disponivel' | 'recomendado' | 'ofertada' | 'contratado' | 'recusou';
type CompatLevel = 'alta' | 'media' | 'baixa' | 'fora';
type MapView = 'status' | 'compat' | 'region';

/** Ordem = prioridade: o estado mais avançado da pessoa é o que aparece. */
const STATUS_INFO: Record<PersonStatus, { label: string; color: string; rank: number }> = {
  disponivel: { label: 'Disponível', color: '#8f7aa3', rank: 0 },
  recomendado: { label: 'Recomendado', color: 'var(--info)', rank: 1 },
  recusou: { label: 'Recusou', color: 'var(--bad)', rank: 2 },
  ofertada: { label: 'Oferta enviada', color: 'var(--sun)', rank: 3 },
  contratado: { label: 'Contratado', color: 'var(--ok)', rank: 4 },
};
const COMPAT_INFO: Record<CompatLevel, { label: string; color: string }> = {
  alta: { label: 'Alta · 75% ou mais', color: 'var(--ok)' },
  media: { label: 'Média · 50 a 74%', color: 'var(--sun)' },
  baixa: { label: 'Baixa · abaixo de 50%', color: 'var(--signal)' },
  fora: { label: 'Fora dos requisitos', color: '#5c3d78' },
};
const compatOf = (e: PairEvaluation): CompatLevel => (!e.feasible ? 'fora' : e.score >= 0.75 ? 'alta' : e.score >= 0.5 ? 'media' : 'baixa');
const offerKey = (vacancyId: string, candidateId: string) => `${vacancyId}|${candidateId}`;
/** Hash de texto para semente: a "resposta" simulada de cada oferta é sempre a mesma. */
const hash = (t: string) => [...t].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7) >>> 0;
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** level: nível dos títulos dos painéis (ver heading.tsx). */
export default function VacancyMatchingLab({ level = 'h3', city }: { level?: 'h2' | 'h3'; city: CityMap }) {
  const paths = pathsFor(city);
  const KM = city.km;
  const [seed, setSeed] = useState(7);
  const [scenario, setScenario] = useState<Scenario>(() => makeScenario(7, 12, 40, city));
  const [selection, setSelection] = useState<Selection>(() => initialSelection(scenario, city));
  const [counter, setCounter] = useState({ v: 12, c: 40 });
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [constraints, setConstraints] = useState<Constraints>(DEFAULT_CONSTRAINTS);
  const [algorithm, setAlgorithm] = useState<Algorithm>('hungarian');
  const [pair, setPair] = useState<{ vacancyId: string; candidateId: string } | null>(null);
  const [mode, setMode] = useState<ClickMode>('select');
  const [layers, setLayers] = useState({ roads: true, matches: true, reach: true, transit: true });
  /** Cliente em foco: só as vagas dele e as pessoas ligadas a elas ficam acesas. */
  const [client, setClient] = useState<string | null>(null);
  const [view, setView] = useState<MapView>('status');
  // De transporte público, só a espera média já passa de 5 minutos: a área começa maior.
  const [areaMin, setAreaMin] = useState(() => (isTransit(city) ? 30 : 15));
  const transitMode = isTransit(city);
  useEffect(() => setAreaMin(transitMode ? 30 : 15), [transitMode]);
  /** Categoria da legenda em foco: as outras pessoas ficam apagadas. */
  const [focus, setFocus] = useState<string | null>(null);
  const [offers, setOffers] = useState<Map<string, OfferState>>(() => new Map());
  const [flights, setFlights] = useState<Flight[]>([]);
  const flightSeq = useRef(0);
  const [generation, setGeneration] = useState(0);
  const previousPairs = useRef<{ generation: number; algorithm: Algorithm; keys: Set<string> } | null>(null);
  const [diff, setDiff] = useState<{ added: number; removed: number } | null>(null);
  // Tempos de execução só existem no cliente; evita divergência com o HTML pré-renderizado.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [target, setTarget] = useState<Target>('browser');

  const { evalOf } = useMemo(() => evaluateAll(scenario, paths, weights, constraints), [scenario, weights, constraints, paths]);
  const request: MatchingRequest = useMemo(
    () => ({ city: city.id, mode: isTransit(city) ? ('transit' as const) : ('car' as const), vacancies: scenario.vacancies, candidates: scenario.candidates, weights, constraints }),
    [scenario, weights, constraints, city],
  );
  const execution = useExecution(request, target, city);
  const results = execution.results;
  const current = results[algorithm];
  const balance = useMemo(() => regionalBalance(scenario, city), [scenario, city]);
  const roads = useMemo(() => roadPaths(city), [city]);

  // Diferença para a alocação anterior do mesmo algoritmo e cenário: mostra como as recomendações mudam.
  useEffect(() => {
    const keys = new Set(current.pairs.map(pairKey));
    const prev = previousPairs.current;
    setDiff(
      prev && prev.generation === generation && prev.algorithm === algorithm
        ? { added: [...keys].filter((k) => !prev.keys.has(k)).length, removed: [...prev.keys].filter((k) => !keys.has(k)).length }
        : null,
    );
    previousPairs.current = { generation, algorithm, keys };
  }, [current, algorithm, generation]);

  const vacancyById = useMemo(() => new Map(scenario.vacancies.map((v) => [v.id, v])), [scenario]);
  const candidateById = useMemo(() => new Map(scenario.candidates.map((c) => [c.id, c])), [scenario]);
  const matchedCandidates = useMemo(() => new Set(current.pairs.map((p) => p.candidateId)), [current]);

  const selectedVacancy = selection?.kind === 'vacancy' ? vacancyById.get(selection.id) : undefined;
  const selectedCandidate = selection?.kind === 'candidate' ? candidateById.get(selection.id) : undefined;

  const ranking: PairEvaluation[] = useMemo(() => {
    const list = selectedVacancy
      ? scenario.candidates.map((c) => evalOf(selectedVacancy.id, c.id))
      : selectedCandidate
        ? scenario.vacancies.map((v) => evalOf(v.id, selectedCandidate.id))
        : [];
    return list.sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.score - a.score);
  }, [selectedVacancy, selectedCandidate, scenario, evalOf]);

  const activePair = pair && vacancyById.has(pair.vacancyId) && candidateById.has(pair.candidateId) ? evalOf(pair.vacancyId, pair.candidateId) : null;

  // Alcance do candidato selecionado: trechos de rua alcançáveis dentro do tempo máximo, num só <path>.
  const reach = useMemo(() => {
    if (!selectedCandidate) return '';
    const start = city.nearest(selectedCandidate.pos);
    const walk = (straightKm(selectedCandidate.pos, city.point(start)) / SPEED_KMH.walk) * 60;
    const sp = paths.fromNode(start);
    const ok = (n: number) => sp.minutes[n] + walk <= selectedCandidate.maxCommuteMin;
    const parts: string[] = [];
    city.network.segments.forEach((s, i) => {
      if (ok(s.a) && ok(s.b)) parts.push(pathD([city.point(s.a), ...city.segmentShape[i], city.point(s.b)]));
    });
    return parts.join('');
  }, [selectedCandidate, city, paths]);

  // ---- Ofertas: enviar, responder, cancelar. Regras: ninguém é contratado duas vezes; vaga cheia não recebe oferta.
  const filledOf = (m: Map<string, OfferState>, vid: string) => [...m].filter(([k, st]) => st === 'aceita' && k.startsWith(vid + '|')).length;
  const hiredSomewhere = (m: Map<string, OfferState>, cid: string) => [...m].some(([k, st]) => st === 'aceita' && k.endsWith('|' + cid));
  const canOffer = (m: Map<string, OfferState>, vid: string, cid: string) => {
    const v = vacancyById.get(vid);
    const st = m.get(offerKey(vid, cid));
    return !!v && st !== 'ofertada' && st !== 'aceita' && !hiredSomewhere(m, cid) && filledOf(m, vid) < v.slots && evalOf(vid, cid).feasible;
  };
  /** Aplica uma resposta e retira as ofertas que deixaram de fazer sentido. */
  const answer = (m: Map<string, OfferState>, vid: string, cid: string, accept: boolean) => {
    m.set(offerKey(vid, cid), accept ? 'aceita' : 'recusada');
    if (!accept) return;
    for (const [k, st] of [...m]) if (st === 'ofertada' && k.endsWith('|' + cid)) m.delete(k);
    const v = vacancyById.get(vid);
    if (v && filledOf(m, vid) >= v.slots) for (const [k, st] of [...m]) if (st === 'ofertada' && k.startsWith(vid + '|')) m.delete(k);
  };
  function fly(list: Omit<Flight, 'key'>[]) {
    if (list.length === 0 || reducedMotion()) return;
    const withKeys = list.map((f) => ({ ...f, key: `f${++flightSeq.current}` }));
    setFlights((fs) => [...fs, ...withKeys]);
    const done = new Set(withKeys.map((f) => f.key));
    setTimeout(() => setFlights((fs) => fs.filter((f) => !done.has(f.key))), Math.max(...list.map((f) => f.delayMs)) + 1100);
  }
  const posOf = (vid: string, cid: string) => ({ v: vacancyById.get(vid)!.pos, c: candidateById.get(cid)!.pos });

  function offer(vid: string, cid: string) {
    if (!canOffer(offers, vid, cid)) return;
    setOffers(new Map(offers).set(offerKey(vid, cid), 'ofertada'));
    const { v, c } = posOf(vid, cid);
    fly([{ from: v, to: c, kind: 'offer', delayMs: 0 }]);
  }
  /**
   * Próxima rodada de ofertas para os postos abertos (sem contratado nem oferta aguardando):
   * primeiro os pares recomendados pelo algoritmo; o que sobrar vai para o melhor candidato viável
   * que ainda não está ocupado nem recusou aquela vaga. Ninguém recebe duas ofertas ao mesmo tempo.
   */
  function planOffers(m: Map<string, OfferState>): [string, string][] {
    const open = new Map(scenario.vacancies.map((v) => [v.id, v.slots - filledOf(m, v.id) - [...m].filter(([k, st]) => st === 'ofertada' && k.startsWith(v.id + '|')).length]));
    const busy = new Set([...m].filter(([, st]) => st !== 'recusada').map(([k]) => k.split('|')[1]));
    const plan: [string, string][] = [];
    const take = (vid: string, cid: string) => {
      plan.push([vid, cid]);
      busy.add(cid);
      open.set(vid, open.get(vid)! - 1);
    };
    for (const p of current.pairs) {
      if ((open.get(p.vacancyId) ?? 0) > 0 && !busy.has(p.candidateId) && !m.has(offerKey(p.vacancyId, p.candidateId)) && evalOf(p.vacancyId, p.candidateId).feasible) take(p.vacancyId, p.candidateId);
    }
    for (const v of scenario.vacancies) {
      const options = scenario.candidates
        .map((c) => evalOf(v.id, c.id))
        .filter((e) => e.feasible && !m.has(offerKey(v.id, e.candidateId)))
        .sort((a, b) => b.score - a.score);
      for (const e of options) {
        if ((open.get(v.id) ?? 0) <= 0) break;
        if (!busy.has(e.candidateId)) take(v.id, e.candidateId);
      }
    }
    return plan;
  }
  function offerOpenSlots() {
    const m = new Map(offers);
    const sent: Omit<Flight, 'key'>[] = [];
    for (const [vid, cid] of planOffers(m)) {
      m.set(offerKey(vid, cid), 'ofertada');
      const { v, c } = posOf(vid, cid);
      sent.push({ from: v, to: c, kind: 'offer', delayMs: sent.length * 90 });
    }
    setOffers(m);
    fly(sent);
  }
  function respond(vid: string, cid: string, accept: boolean) {
    const m = new Map(offers);
    answer(m, vid, cid, accept);
    setOffers(m);
    const { v, c } = posOf(vid, cid);
    fly([{ from: c, to: v, kind: accept ? 'accept' : 'decline', delayMs: 0 }]);
  }
  /** Simula as respostas: aceita com probabilidade crescente com o score (sorteio fixo por par e cenário). */
  function simulateAnswers() {
    const m = new Map(offers);
    const pending = [...m]
      .filter(([, st]) => st === 'ofertada')
      .map(([k]) => k.split('|') as [string, string])
      .sort((a, b) => evalOf(b[0], b[1]).score - evalOf(a[0], a[1]).score);
    const back: Omit<Flight, 'key'>[] = [];
    for (const [vid, cid] of pending) {
      if (m.get(offerKey(vid, cid)) !== 'ofertada') continue; // retirada por uma resposta anterior
      const accept = rng(hash(`${seed}|${vid}|${cid}`)).next() < 0.2 + 0.6 * evalOf(vid, cid).score;
      answer(m, vid, cid, accept);
      const { v, c } = posOf(vid, cid);
      back.push({ from: c, to: v, kind: accept ? 'accept' : 'decline', delayMs: back.length * 120 });
    }
    setOffers(m);
    fly(back);
  }
  function cancelOffer(vid: string, cid: string) {
    const m = new Map(offers);
    m.delete(offerKey(vid, cid));
    setOffers(m);
  }

  const status = useMemo(() => {
    const out = new Map<string, PersonStatus>();
    for (const c of scenario.candidates) out.set(c.id, matchedCandidates.has(c.id) ? 'recomendado' : 'disponivel');
    for (const [k, st] of offers) {
      const cid = k.split('|')[1];
      const s: PersonStatus = st === 'aceita' ? 'contratado' : st === 'ofertada' ? 'ofertada' : 'recusou';
      const prev = out.get(cid);
      if (prev && STATUS_INFO[s].rank > STATUS_INFO[prev].rank) out.set(cid, s);
    }
    return out;
  }, [scenario, offers, matchedCandidates]);
  const pendingCount = [...offers.values()].filter((st) => st === 'ofertada').length;
  const offerableCount = useMemo(() => planOffers(offers).length, [offers, current, evalOf, scenario]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalSlots = scenario.vacancies.reduce((n, v) => n + v.slots, 0);
  const hiredCount = [...offers.values()].filter((st) => st === 'aceita').length;

  // Vaga de referência da visão de compatibilidade e da área: a selecionada ou a do par aberto.
  const focusVacancy = selectedVacancy ?? (activePair ? vacancyById.get(activePair.vacancyId) : undefined);

  // "Pessoas na área": ruas a até areaMin minutos da vaga e quem mora dentro desse tempo.
  const area = useMemo(() => {
    if (!focusVacancy || focusVacancy.modality === 'remoto') return null;
    const start = city.nearest(focusVacancy.pos);
    const walk = (straightKm(focusVacancy.pos, city.point(start)) / SPEED_KMH.walk) * 60;
    const sp = paths.fromNode(start);
    const ok = (n: number) => sp.minutes[n] + walk <= areaMin;
    const parts: string[] = [];
    city.network.segments.forEach((s, i) => {
      if (ok(s.a) && ok(s.b)) parts.push(pathD([city.point(s.a), ...city.segmentShape[i], city.point(s.b)]));
    });
    const inside = scenario.candidates.filter((c) => (evalOf(focusVacancy.id, c.id).commute?.minutes ?? Infinity) <= areaMin);
    return { d: parts.join(''), inside };
  }, [focusVacancy, areaMin, city, paths, scenario, evalOf]);

  // ---- Clientes: uma empresa pode ter várias vagas, cada uma com o próprio perfil. Tudo é calculado por vaga;
  // aqui só se agrupa para ver o cliente inteiro.
  const clients = useMemo(() => {
    const by = new Map<string, { name: string; vacancies: string[]; slots: number; filled: number; pending: number }>();
    for (const v of scenario.vacancies) {
      const c = by.get(v.company) ?? { name: v.company, vacancies: [], slots: 0, filled: 0, pending: 0 };
      c.vacancies.push(v.id);
      c.slots += v.slots;
      c.filled += filledOf(offers, v.id);
      c.pending += [...offers].filter(([k, st]) => st === 'ofertada' && k.startsWith(v.id + '|')).length;
      by.set(v.company, c);
    }
    return [...by.values()].sort((a, b) => b.vacancies.length - a.vacancies.length || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, offers]);
  const clientVacancies = useMemo(() => new Set(client ? scenario.vacancies.filter((v) => v.company === client).map((v) => v.id) : []), [client, scenario]);
  /** Pessoas ligadas ao cliente em foco: recomendadas ou com oferta numa vaga dele. */
  const clientPeople = useMemo(() => {
    const out = new Set<string>();
    if (!client) return out;
    for (const p of current.pairs) if (clientVacancies.has(p.vacancyId)) out.add(p.candidateId);
    for (const k of offers.keys()) {
      const [vid, cid] = k.split('|');
      if (clientVacancies.has(vid)) out.add(cid);
    }
    return out;
  }, [client, clientVacancies, current, offers]);
  const dimmedVacancies = useMemo(() => new Set(client ? scenario.vacancies.filter((v) => !clientVacancies.has(v.id)).map((v) => v.id) : []), [client, clientVacancies, scenario]);

  // Transporte público: linhas desenhadas por modo e trajeto do par aberto em trechos.
  const transitPaths = useMemo(() => {
    if (!isTransit(city)) return [];
    const by = new Map<TransitMode, string[]>();
    for (const l of city.lines) {
      const list = by.get(l.mode) ?? [];
      list.push(pathD(l.stops));
      by.set(l.mode, list);
    }
    return [...by].map(([mode, d]) => ({ mode, d: d.join(''), rail: MODE_INFO[mode].rail }));
  }, [city]);
  const legsOf = (e: PairEvaluation): Leg[] | null => {
    if (!isTransit(city) || !e.commute) return null;
    const v = vacancyById.get(e.vacancyId);
    if (!v) return null;
    return e.commute.along ? tripLegs(city, e.commute.path, e.commute.along) : null;
  };
  const activeLegs = activePair ? legsOf(activePair) : null;

  const people = useMemo(() => {
    const out = new Map<string, PersonLook>();
    const compat = view === 'compat' && focusVacancy;
    // Na compatibilidade, as 5 melhores pessoas ganham a porcentagem ao lado.
    const top = compat
      ? new Set(
          scenario.candidates
            .map((c) => evalOf(focusVacancy.id, c.id))
            .filter((e) => e.feasible)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((e) => e.candidateId),
        )
      : new Set<string>();
    for (const c of scenario.candidates) {
      const st = status.get(c.id)!;
      const e = focusVacancy ? evalOf(focusVacancy.id, c.id) : null;
      const level = e ? compatOf(e) : null;
      const category = compat && level ? level : st;
      const parts = [`${c.name} · ${c.course}`, STATUS_INFO[st].label];
      if (e && focusVacancy) {
        parts.push(e.feasible ? `compatibilidade ${pct(e.score)} com ${focusVacancy.company}` : `fora dos requisitos de ${focusVacancy.company}`);
        if (e.commute) parts.push(`${num(e.commute.minutes, 0)} min até a vaga`);
      }
      out.set(c.id, {
        color: compat && level ? COMPAT_INFO[level].color : STATUS_INFO[st].color,
        ring: st === 'ofertada' ? 'offer' : st === 'contratado' ? 'hired' : st === 'recusou' ? 'declined' : undefined,
        tag: top.has(c.id) && e ? pct(e.score) : undefined,
        dim: (focus !== null && focus !== category) || (client !== null && !clientPeople.has(c.id)),
        summary: parts.join(' · '),
      });
    }
    return out;
  }, [scenario, status, view, focusVacancy, evalOf, focus, client, clientPeople]);

  const vacancyLooks = useMemo(() => {
    const out = new Map<string, VacancyLook>();
    for (const v of scenario.vacancies) {
      const filled = filledOf(offers, v.id);
      const pending = [...offers].filter(([k, st]) => st === 'ofertada' && k.startsWith(v.id + '|')).length;
      out.set(v.id, {
        filled,
        slots: v.slots,
        summary: `${v.title} — ${v.company} · ${MODALITY_LABEL[v.modality]} · ${filled}/${v.slots} postos preenchidos${pending ? ` · ${pending} oferta(s) aguardando` : ''} · R$ ${v.stipend}`,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, offers]);

  /** Contagens da legenda: por status ou por compatibilidade com a vaga em foco. */
  const legend = useMemo(() => {
    if (view === 'compat' && focusVacancy) {
      const counts: Record<CompatLevel, number> = { alta: 0, media: 0, baixa: 0, fora: 0 };
      for (const c of scenario.candidates) counts[compatOf(evalOf(focusVacancy.id, c.id))]++;
      return (Object.keys(COMPAT_INFO) as CompatLevel[]).map((k) => ({ key: k, ...COMPAT_INFO[k], count: counts[k] }));
    }
    const counts: Record<PersonStatus, number> = { disponivel: 0, recomendado: 0, recusou: 0, ofertada: 0, contratado: 0 };
    for (const st of status.values()) counts[st]++;
    return (['contratado', 'ofertada', 'recomendado', 'recusou', 'disponivel'] as PersonStatus[]).map((k) => ({ key: k, ...STATUS_INFO[k], count: counts[k] }));
  }, [view, focusVacancy, scenario, evalOf, status]);

  function changeView(v: MapView) {
    setView(v);
    setFocus(null);
    // Compatibilidade é sempre em relação a uma vaga: sem nenhuma em foco, abre a de mais candidatos viáveis.
    if (v === 'compat' && !focusVacancy) setSelection(initialSelection(scenario, city));
  }

  function regenerate(newSeed: number, nv = 12, nc = 40) {
    setOffers(new Map());
    setFocus(null);
    setSeed(newSeed);
    const next = makeScenario(newSeed, nv, nc, city);
    setScenario(next);
    setCounter({ v: nv, c: nc });
    setSelection(initialSelection(next, city));
    setPair(null);
    setGeneration((g) => g + 1);
  }

  /** Nova vaga com perfil sorteado; com `company`, é mais uma vaga do mesmo cliente (mesmo endereço). */
  function addVacancy(at?: Point, company?: string) {
    const id = `V${counter.v + 1}`;
    const v = makeVacancy(rng(seed * 1000 + counter.v + counter.c), id, city);
    const placed = { ...v, ...(at ? { pos: at } : {}), ...(company ? { company } : {}) };
    setScenario((s) => ({ ...s, vacancies: [...s.vacancies, placed] }));
    setCounter((k) => ({ ...k, v: k.v + 1 }));
    setSelection({ kind: 'vacancy', id });
  }

  function addCandidate(at?: Point) {
    const id = `I${counter.c + 1}`;
    const c = makeCandidate(rng(seed * 1000 + counter.v + counter.c), id, city);
    const placed = at ? { ...c, pos: at, preferredRegions: [regionOf(at, city), ...c.preferredRegions.slice(1)] } : c;
    setScenario((s) => ({ ...s, candidates: [...s.candidates, placed] }));
    setCounter((k) => ({ ...k, c: k.c + 1 }));
    setSelection({ kind: 'candidate', id });
  }

  function removeSelected() {
    if (!selection) return;
    setScenario((s) =>
      selection.kind === 'vacancy'
        ? { ...s, vacancies: s.vacancies.filter((v) => v.id !== selection.id) }
        : { ...s, candidates: s.candidates.filter((c) => c.id !== selection.id) },
    );
    setOffers((m) => new Map([...m].filter(([k]) => !k.split('|').includes(selection.id))));
    setSelection(null);
    setPair(null);
  }

  function onPlace(p: Point) {
    // Perto da rua mais próxima: clicar no mar ou num parque não põe ninguém morando lá.
    const at = city.place(p);
    if (mode === 'add-vacancy') addVacancy(at);
    else addCandidate(at);
  }

  const select = (kind: 'vacancy' | 'candidate', id: string) => {
    setSelection({ kind, id });
    setPair(null);
  };

  // Teclado no mapa: uma só parada de Tab; setas percorrem os pontos em ordem de leitura
  // (faixas de 1 km de cima para baixo, depois da esquerda para a direita); Enter seleciona.
  const mapOrder = useMemo(
    () =>
      [...scenario.vacancies.map((v) => ({ kind: 'vacancy' as const, id: v.id, pos: v.pos })), ...scenario.candidates.map((c) => ({ kind: 'candidate' as const, id: c.id, pos: c.pos }))].sort(
        (a, b) => Math.floor(a.pos.y) - Math.floor(b.pos.y) || a.pos.x - b.pos.x,
      ),
    [scenario],
  );
  const orderOf = useMemo(() => new Map(mapOrder.map((p, i) => [p.id, i])), [mapOrder]);
  const [cursor, setCursor] = useState(0);
  const pointRefs = useRef(new Map<string, SVGGElement>());
  const onPointKey = (e: KeyboardEvent, id: string) => {
    const i = orderOf.get(id) ?? 0;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    let next = i;
    if (step) next = (i + step + mapOrder.length) % mapOrder.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = mapOrder.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(mapOrder[i].kind, id);
      return;
    } else return;
    e.preventDefault();
    setCursor(next);
    pointRefs.current.get(mapOrder[next].id)?.focus();
  };
  const pointProps = (kind: 'vacancy' | 'candidate', id: string, label: string) => ({
    ref: (el: SVGGElement | null) => {
      if (el) pointRefs.current.set(id, el);
      else pointRefs.current.delete(id);
    },
    role: 'button',
    tabIndex: (orderOf.get(id) ?? -1) === Math.min(cursor, mapOrder.length - 1) ? 0 : -1,
    'aria-label': label,
    'aria-pressed': selection?.id === id,
    onFocus: () => setCursor(orderOf.get(id) ?? 0),
    onKeyDown: (e: KeyboardEvent) => onPointKey(e, id),
    onClick: (e: MouseEvent) => {
      if (mode !== 'select') return;
      e.stopPropagation();
      select(kind, id);
    },
  });

  const highlight = new Set<string>();
  if (selection) highlight.add(selection.id);
  if (activePair) {
    highlight.add(activePair.vacancyId);
    highlight.add(activePair.candidateId);
  }

  return (
    <HeadingLevel.Provider value={level}>
    <div className="vm">
      <ol className="vm-steps">
        <li>
          <strong>Escolha uma vaga</strong>
          <span>Clique numa maleta no mapa. Cada empresa pode ter várias vagas, cada uma com o próprio perfil.</span>
        </li>
        <li>
          <strong>Veja quem combina</strong>
          <span>
            Ao lado aparecem as pessoas que cumprem as regras (curso, turno, tempo de viagem{transitMode ? ' e conduções' : ''}), da mais para a menos
            compatível. Clique numa para ver o trajeto.
          </span>
        </li>
        <li>
          <strong>Oferte e acompanhe</strong>
          <span>Oferte a vaga e simule as respostas: o mapa mostra quem foi contratado, quem recusou e quem está esperando.</span>
        </li>
      </ol>
      <div className="vm-top">
        <div className="vm-map card">
          <div className="vm-toolbar">
            <span className="muted">Clique no mapa:</span>
            {(['select', 'add-vacancy', 'add-candidate'] as ClickMode[]).map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === 'select' ? 'Selecionar' : m === 'add-vacancy' ? '+ Vaga' : '+ Candidato'}
              </button>
            ))}
            <span className="vm-toolbar-gap" />
            <button className="vm-offer-btn" onClick={offerOpenSlots} disabled={offerableCount === 0}>
              Ofertar vagas abertas ({offerableCount})
            </button>
            <button onClick={simulateAnswers} disabled={pendingCount === 0}>
              Simular respostas ({pendingCount})
            </button>
            <button onClick={() => setOffers(new Map())} disabled={offers.size === 0}>
              Limpar ofertas
            </button>
          </div>
          <TerritoryMap
            city={city}
            scenario={scenario}
            generation={generation}
            roads={roads}
            showRoads={layers.roads}
            water={city.water.map((w, i) =>
              w.kind === 0 ? <polygon key={i} points={pts(w.pts)} className="vm-water" /> : <polyline key={i} points={pts(w.pts)} className={w.kind === 1 ? 'vm-river' : 'vm-coast'} />,
            )}
            under={
              <>
                {view === 'region' &&
                  balance.map((b) => {
                    const col = b.region.endsWith('O') ? 0 : 1;
                    const row = b.region.startsWith('N') ? 0 : b.region.startsWith('C') ? 1 : 2;
                    const x = col === 0 ? 0 : city.splitX;
                    const w = col === 0 ? city.splitX : KM - city.splitX;
                    const fill = b.ratio > 1.3 ? 'var(--info)' : b.ratio < 0.7 ? 'var(--signal)' : 'transparent';
                    return (
                      <g key={b.region}>
                        <rect x={x} y={(row * KM) / 3} width={w} height={KM / 3} style={{ fill }} opacity={0.14} className="tm-region" />
                        <text x={x + 0.15} y={(row * KM) / 3 + 0.4} className="vm-region-label">
                          {REGIONS[b.region]} · {b.slots} postos / {b.candidates} pessoas
                        </text>
                      </g>
                    );
                  })}
                {layers.transit &&
                  transitPaths.map((t) => <path key={t.mode} d={t.d} className={`tm-transit ${t.rail ? 'rail' : 'bus'}`} style={{ stroke: MODE_COLOR[t.mode] }} />)}
                {view !== 'region' && area && <path key={`${focusVacancy?.id}-${areaMin}`} d={area.d} className="tm-area" />}
                {layers.reach && reach && <path d={reach} className="vm-reach" />}
                {layers.matches &&
                  view !== 'compat' &&
                  [...new Set([...current.pairs.map(pairKey), ...offers.keys()])].map((k) => {
                    const [vid, cid] = k.split('|');
                    const v = vacancyById.get(vid);
                    const c = candidateById.get(cid);
                    if (!v || !c) return null;
                    const st = offers.get(k);
                    return <line key={k} x1={v.pos.x} y1={v.pos.y} x2={c.pos.x} y2={c.pos.y} className={`vm-match ${st ?? 'rec'}`} />;
                  })}
                {activePair?.commute && (
                  <g key={pairKey(activePair)}>
                    <line
                      x1={candidateById.get(activePair.candidateId)!.pos.x}
                      y1={candidateById.get(activePair.candidateId)!.pos.y}
                      x2={vacancyById.get(activePair.vacancyId)!.pos.x}
                      y2={vacancyById.get(activePair.vacancyId)!.pos.y}
                      className="vm-straight"
                    />
                    {activeLegs ? (
                      activeLegs.map((l, i) =>
                        l.kind === 'walk' ? (
                          <polyline key={i} points={pts(routePoints(city, l.nodes))} className="tm-leg walk" />
                        ) : (
                          <polyline key={i} points={pts(l.nodes.map((n) => city.point(n)))} pathLength={1} className="tm-leg ride tm-draw" style={{ stroke: MODE_COLOR[l.mode] }} />
                        ),
                      )
                    ) : (
                      <polyline points={pts(routePoints(city, activePair.commute.path))} pathLength={1} className="vm-route tm-draw" />
                    )}
                  </g>
                )}
              </>
            }
            people={people}
            vacancies={vacancyLooks}
            dimmedVacancies={dimmedVacancies}
            highlight={highlight}
            selectedVacancy={focusVacancy?.id}
            flights={flights}
            bind={pointProps}
            adding={mode !== 'select'}
            onPlace={onPlace}
            ariaLabel={`Mapa de ${city.name} com vagas e candidatos. Use as setas para percorrer os pontos e Enter para selecionar.`}
            panel={
              <>
                <p className="tm-panel-title">
                  {client ? `Cliente · ${client}` : view === 'compat' && focusVacancy ? `Compatibilidade · ${focusVacancy.company}` : view === 'region' ? 'Oferta × demanda' : 'Pessoas no território'}
                </p>
                <div className="tm-progress" title="Postos preenchidos por ofertas aceitas">
                  <span>Postos preenchidos</span>
                  {(() => {
                    const c = client ? clients.find((x) => x.name === client) : null;
                    const done = c ? c.filled : hiredCount;
                    const all = c ? c.slots : totalSlots;
                    return (
                      <>
                        <strong>
                          {done}/{all}
                        </strong>
                        <i style={{ ['--p' as string]: all ? done / all : 0 }} />
                      </>
                    );
                  })()}
                </div>
                {view !== 'region' ? (
                  <ul className="tm-legend">
                    {legend.map((l) => (
                      <li key={l.key}>
                        <button type="button" aria-pressed={focus === l.key} className={focus && focus !== l.key ? 'off' : ''} onClick={() => setFocus(focus === l.key ? null : l.key)}>
                          <i style={{ background: l.color }} />
                          <span>{l.label}</span>
                          <b>{l.count}</b>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="tm-legend static">
                    <li><span><i style={{ background: 'var(--info)' }} /> muitas vagas, poucas pessoas</span></li>
                    <li><span><i style={{ background: 'var(--signal)' }} /> muitas pessoas, poucas vagas</span></li>
                  </ul>
                )}
                {area && focusVacancy && view !== 'region' && (
                  <div className="tm-area-box">
                    <p>
                      <strong>{area.inside.length}</strong> pessoas a até <strong>{areaMin} min</strong> de {focusVacancy.company}
                    </p>
                    <input type="range" min={5} max={60} step={5} value={areaMin} aria-label="Tempo máximo até a vaga" aria-valuetext={`${areaMin} minutos`} onChange={(e) => setAreaMin(Number(e.target.value))} />
                  </div>
                )}
              </>
            }
            dock={
              <div className="tm-views" role="radiogroup" aria-label="Visão do mapa">
                {(
                  [
                    ['status', 'Status'],
                    ['compat', 'Compatibilidade'],
                    ['region', 'Região'],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => changeView(k)}>
                    {label}
                  </button>
                ))}
              </div>
            }
          />
          <div className="vm-legend muted">
            <span><i className="sq" /> vaga (etiqueta: empresa · postos preenchidos)</span>
            <span><i className="dot" /> pessoa (anel girando: oferta aguardando)</span>
            {isTransit(city) ? (
              <>
                <span><i className="ln walkleg" /> trecho a pé</span>
                <span><i className="ln" style={{ borderTopColor: 'var(--info)' }} /> ônibus</span>
                <span><i className="ln" style={{ borderTopColor: 'var(--signal)' }} /> metrô</span>
                <span><i className="ln" style={{ borderTopColor: 'var(--sun)' }} /> trem</span>
              </>
            ) : (
              <span><i className="ln route" /> rota pelas ruas</span>
            )}
            <span><i className="ln straight" /> linha reta</span>
            <span><i className="ln area" /> área a até {areaMin} min da vaga</span>
            {city.center && (
              <span className="osm">
                ruas: © <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>
              </span>
            )}
          </div>
          <div className="vm-layers">
            {(
              [
                ['roads', 'Ruas'],
                ['matches', 'Linhas de recomendação e oferta'],
                ...(isTransit(city) ? ([['transit', 'Linhas de transporte']] as const) : []),
                ['reach', 'Alcance do candidato'],
              ] as const
            ).map(([k, label]) => (
              <label key={k}>
                <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} /> {label}
              </label>
            ))}
          </div>
        </div>

        <aside className="vm-side card" aria-label="Vaga ou pessoa escolhida">
          {selectedVacancy && (
            <>
              <p className="eyebrow">Vaga escolhida</p>
              <Heading>
                {selectedVacancy.title} — {selectedVacancy.company}
              </Heading>
              <div className="vm-row">
                <button onClick={() => addVacancy(selectedVacancy.pos, selectedVacancy.company)}>+ Outra vaga deste cliente</button>
                <button onClick={() => setClient(client === selectedVacancy.company ? null : selectedVacancy.company)} aria-pressed={client === selectedVacancy.company}>
                  {client === selectedVacancy.company ? 'Ver todos os clientes' : `Focar em ${selectedVacancy.company}`}
                </button>
              </div>
              <dl className="vm-facts">
                <dt>Região</dt><dd>{REGIONS[regionOf(selectedVacancy.pos, city)]}</dd>
                <dt>Área</dt><dd>{selectedVacancy.area}</dd>
                <dt>Cursos aceitos</dt><dd>{selectedVacancy.courses.join(', ')}</dd>
                <dt>Requisitos</dt><dd>{selectedVacancy.skills.join(', ')}</dd>
                <dt>Turnos</dt><dd>{selectedVacancy.shifts.map((s) => SHIFT_LABEL[s]).join(', ')}</dd>
                <dt>Modalidade</dt><dd>{MODALITY_LABEL[selectedVacancy.modality]}</dd>
                <dt>Bolsa</dt><dd>R$ {selectedVacancy.stipend}</dd>
                {selectedVacancy.modality !== 'remoto' && (
                  <>
                    <dt>Vale-transporte</dt>
                    <dd>
                      {selectedVacancy.fares} conduções por dia ({selectedVacancy.fares / 2} na ida, {selectedVacancy.fares / 2} na volta)
                      {!transitMode && <span className="muted"> · só conta no transporte público</span>}
                    </dd>
                  </>
                )}
                <dt>Benefícios</dt><dd>{selectedVacancy.benefits.join(', ') || '—'}</dd>
                <dt>Postos</dt><dd>{filledOf(offers, selectedVacancy.id)} de {selectedVacancy.slots} preenchidos</dd>
              </dl>
            </>
          )}
          {selectedCandidate && (
            <>
              <p className="eyebrow">Candidato escolhido</p>
              <Heading>{selectedCandidate.name}</Heading>
              <dl className="vm-facts">
                <dt>Situação</dt>
                <dd>
                  <span className="vm-status" style={{ ['--c' as string]: STATUS_INFO[status.get(selectedCandidate.id)!].color }}>
                    {STATUS_INFO[status.get(selectedCandidate.id)!].label}
                  </span>
                </dd>
                <dt>Região</dt><dd>{REGIONS[regionOf(selectedCandidate.pos, city)]} (localização aproximada)</dd>
                <dt>Regiões preferidas</dt><dd>{selectedCandidate.preferredRegions.map((r: RegionId) => REGIONS[r]).join(', ')}</dd>
                <dt>Curso</dt><dd>{selectedCandidate.course}</dd>
                <dt>Competências</dt><dd>{selectedCandidate.skills.join(', ')}</dd>
                <dt>Disponibilidade</dt><dd>{selectedCandidate.availability.map((s) => SHIFT_LABEL[s]).join(', ')}</dd>
                <dt>Modalidades</dt><dd>{selectedCandidate.modalities.map((m) => MODALITY_LABEL[m]).join(', ')}</dd>
                <dt>Deslocamento máx.</dt><dd>{selectedCandidate.maxCommuteMin} min</dd>
                <dt>Bolsa desejada</dt><dd>R$ {selectedCandidate.desiredStipend}</dd>
                <dt>Interesses</dt><dd>{selectedCandidate.interests.join(', ')}</dd>
              </dl>
            </>
          )}
          {!selection && <p className="muted">Clique numa vaga (maleta) ou numa pessoa (círculo) no mapa.</p>}

          {selection && (
            <Ranking
              ranking={ranking}
              perspective={selection.kind}
              nameOf={(e) =>
                selection.kind === 'vacancy' ? candidateById.get(e.candidateId)?.name ?? e.candidateId : `${vacancyById.get(e.vacancyId)?.title} — ${vacancyById.get(e.vacancyId)?.company}`
              }
              vacancyOf={(e) => vacancyById.get(e.vacancyId)!}
              candidateOf={(e) => candidateById.get(e.candidateId)!}
              constraints={constraints}
              isMatched={(e) => current.pairs.some((p) => p.vacancyId === e.vacancyId && p.candidateId === e.candidateId)}
              offerOf={(e) => offers.get(offerKey(e.vacancyId, e.candidateId))}
              canOffer={(e) => canOffer(offers, e.vacancyId, e.candidateId)}
              onOffer={(e) => offer(e.vacancyId, e.candidateId)}
              onRespond={(e, accept) => respond(e.vacancyId, e.candidateId, accept)}
              onCancel={(e) => cancelOffer(e.vacancyId, e.candidateId)}
              legsOf={legsOf}
              active={activePair}
              onPick={(e) => setPair({ vacancyId: e.vacancyId, candidateId: e.candidateId })}
              weights={weights}
            />
          )}
        </aside>
      </div>

      <section className="card vm-clients-card">
          <Heading>Clientes</Heading>
          <p className="muted small">Cada vaga tem o próprio perfil e é calculada sozinha; aqui elas se somam por empresa. Clique para focar o mapa no cliente.</p>
          <div className="vm-table-wrap" role="region" aria-label="Clientes (rolável)" tabIndex={0}>
            <table className="vm-table vm-clients">
              <thead>
                <tr><th>Cliente</th><th>Vagas</th><th>Postos</th><th>Preenchidos</th><th>Aguardando</th></tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.name} className={client === c.name ? 'on' : ''}>
                    <td>
                      <button className="vm-link" aria-pressed={client === c.name} onClick={() => setClient(client === c.name ? null : c.name)}>
                        {c.name}
                      </button>
                    </td>
                    <td>{c.vacancies.length}</td>
                    <td>{c.slots}</td>
                    <td>{c.filled}</td>
                    <td>{c.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {client && (
            <button className="vm-link" onClick={() => setClient(null)}>
              Ver todos os clientes
            </button>
          )}

      </section>

      <details className="vm-advanced">
        <summary>
          <span className="vm-adv-title">Ajustes avançados</span>
          <span className="muted small">sorteio, pesos do score, regras obrigatórias, algoritmo, oferta × demanda e desempenho</span>
        </summary>
        <div className="vm-adv-grid">
        <div className="vm-controls card">
          <Heading>Cenário</Heading>
          <div className="vm-row">
            <label>
              Seed <input type="number" value={seed} onChange={(e) => regenerate(Number(e.target.value) || 1)} />
            </label>
            <button onClick={() => regenerate(Math.floor(Math.random() * 10000))}>Novo cenário</button>
          </div>
          <div className="vm-row">
            <button onClick={() => addVacancy()}>+ Vaga</button>
            <button onClick={() => addCandidate()}>+ Candidato</button>
            <button onClick={removeSelected} disabled={!selection}>Remover selecionado</button>
          </div>
          <p className="muted small">
            {scenario.vacancies.length} vagas ({current.metrics.totalSlots} postos) · {scenario.candidates.length} candidatos
          </p>

          <Heading>Pesos do score</Heading>
          {DIMENSIONS.map((d) => (
            <label key={d} className="vm-slider">
              <span>
                <i style={{ background: DIM_COLOR[d] }} /> {DIMENSION_LABEL[d]}
              </span>
              <input type="range" min={0} max={5} step={0.5} value={weights[d]} aria-valuetext={`peso ${String(weights[d]).replace('.', ',')} de 5`} onChange={(e) => setWeights({ ...weights, [d]: Number(e.target.value) })} />
              <output>{weights[d]}</output>
            </label>
          ))}

          <Heading>Restrições obrigatórias</Heading>
          <p className="muted small">Ativas: viram filtro e nenhum score compensa. Inativas: o critério só pesa no score.</p>
          {(Object.keys(CONSTRAINT_LABEL) as (keyof Constraints)[]).map((k) => (
            <label key={k} className="vm-check">
              <input type="checkbox" checked={constraints[k]} onChange={(e) => setConstraints({ ...constraints, [k]: e.target.checked })} />
              {CONSTRAINT_LABEL[k]}
            </label>
          ))}

          <Heading id="vm-algo-title">Algoritmo no mapa</Heading>
          <select aria-labelledby="vm-algo-title" value={algorithm} onChange={(e) => setAlgorithm(e.target.value as Algorithm)}>
            {ALGORITHMS.map((a) => (
              <option key={a} value={a}>
                {ALGORITHM_INFO[a].label}
              </option>
            ))}
          </select>
          <p className="muted small">{ALGORITHM_INFO[algorithm].objective}</p>
          {diff && (
            <p className="small vm-diff">
              Última alteração: <span className="plus">+{diff.added} pares</span> · <span className="minus">−{diff.removed} pares</span>
            </p>
          )}
        </div>

          <section className="card">
          <Heading>Oferta × demanda por região</Heading>
          <p className="muted small">Postos presenciais/híbridos localizados na região contra candidatos que moram nela.</p>
          <table className="vm-table">
            <thead>
              <tr><th>Região</th><th>Postos</th><th>Candidatos</th><th>Postos/candidato</th><th /></tr>
            </thead>
            <tbody>
              {balance.map((b) => (
                <tr key={b.region}>
                  <td>{REGIONS[b.region]}</td>
                  <td>{b.slots}</td>
                  <td>{b.candidates}</td>
                  <td>{Number.isFinite(b.ratio) ? num(b.ratio, 2) : '∞'}</td>
                  <td className="small">
                    {b.ratio > 1.3 ? <span className="tag-accent">muitas vagas, poucos candidatos</span> : b.ratio < 0.7 ? <span className="tag-warn">muitos candidatos, poucas vagas</span> : 'equilibrada'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </section>
        </div>
      <ExecutionPanel
        target={target}
        onTarget={setTarget}
        localMs={execution.local.ms}
        cloud={execution.cloud}
        fresh={execution.fresh}
        identical={execution.identical}
        mounted={mounted}
      />

      <section className="card">
        <Heading>Comparação de algoritmos</Heading>
        {/* Anuncia cada nova alocação a leitores de tela (o mapa é visual). */}
        <p className="sr-only" aria-live="polite">
          {ALGORITHM_INFO[algorithm].label}: {results[algorithm].metrics.filledSlots} de {results[algorithm].metrics.totalSlots} postos preenchidos,{' '}
          {results[algorithm].metrics.blockingPairs} pares bloqueantes.
        </p>
        {/* Região rolável e focável: no celular a tabela passa da largura e o teclado precisa alcançá-la. */}
        <div className="vm-table-wrap" role="region" aria-label="Comparação de algoritmos (rolável)" tabIndex={0}>
          <table className="vm-table">
            <thead>
              <tr>
                <th>Algoritmo</th>
                <th>Pares</th>
                <th>Postos preenchidos</th>
                <th>Score total</th>
                <th>Score médio</th>
                <th>Deslocamento médio</th>
                <th>Candidatos sem vaga</th>
                <th title="Pares vaga–candidato que prefeririam um ao outro à alocação atual">Pares bloqueantes</th>
                <th>{target === 'cloud' && execution.fresh ? 'Tempo (servidor)' : 'Tempo (navegador)'}</th>
              </tr>
            </thead>
            <tbody>
              {ALGORITHMS.map((a) => {
                const m = results[a].metrics;
                return (
                  <tr key={a} className={a === algorithm ? 'on' : ''} onClick={() => setAlgorithm(a)}>
                    <td>
                      <button className="vm-link" aria-pressed={a === algorithm} onClick={(e) => (e.stopPropagation(), setAlgorithm(a))}>
                        {ALGORITHM_INFO[a].label}
                      </button>
                    </td>
                    <td>{m.pairs}</td>
                    <td>
                      {m.filledSlots}/{m.totalSlots}
                    </td>
                    <td>{num(m.totalScore, 2)}</td>
                    <td>{pct(m.meanScore)}</td>
                    <td>{m.meanCommuteMin === null ? '—' : `${num(m.meanCommuteMin, 0)} min`}</td>
                    <td>{m.unmatchedCandidates}</td>
                    <td>{m.blockingPairs}</td>
                    <td>{mounted ? msText(m.elapsedMs) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      </details>
    </div>
    </HeadingLevel.Provider>
  );
}

interface RankingProps {
  ranking: PairEvaluation[];
  perspective: 'vacancy' | 'candidate';
  nameOf: (e: PairEvaluation) => string;
  vacancyOf: (e: PairEvaluation) => Vacancy;
  candidateOf: (e: PairEvaluation) => Candidate;
  constraints: Constraints;
  isMatched: (e: PairEvaluation) => boolean;
  active: PairEvaluation | null;
  onPick: (e: PairEvaluation) => void;
  weights: Weights;
  offerOf: (e: PairEvaluation) => OfferState | undefined;
  canOffer: (e: PairEvaluation) => boolean;
  onOffer: (e: PairEvaluation) => void;
  onRespond: (e: PairEvaluation, accept: boolean) => void;
  onCancel: (e: PairEvaluation) => void;
  legsOf: (e: PairEvaluation) => Leg[] | null;
}

const OFFER_BADGE: Record<OfferState, string> = { ofertada: 'oferta enviada', aceita: 'contratado', recusada: 'recusou' };

interface Check {
  label: string;
  ok: boolean;
  text: string;
  /** Regra obrigatória ligada: se falhar, o par fica fora. Sem regra, só pesa no score. */
  rule: boolean;
}

/** Os requisitos de um par em palavras, na ordem em que alguém confere: dá para trabalhar? chega a tempo? */
function checksOf(e: PairEvaluation, v: Vacancy, c: Candidate, k: Constraints): Check[] {
  const covered = v.shifts.filter((x) => c.availability.includes(x));
  const skills = v.skills.filter((x) => c.skills.includes(x));
  const out: Check[] = [
    {
      label: 'Curso',
      ok: v.courses.includes(c.course),
      text: v.courses.includes(c.course) ? `${c.course} é aceito` : `${c.course} não é aceito (aceita ${v.courses.join(', ')})`,
      rule: k.course,
    },
    {
      label: 'Turnos',
      ok: covered.length === v.shifts.length,
      text: `pode em ${covered.length} de ${v.shifts.length} (${v.shifts.map((x) => SHIFT_LABEL[x].toLowerCase()).join(', ')})`,
      rule: k.schedule,
    },
    {
      label: 'Modalidade',
      ok: c.modalities.includes(v.modality),
      text: `${MODALITY_LABEL[v.modality]}${c.modalities.includes(v.modality) ? '' : ': a pessoa não aceita'}`,
      rule: k.modality,
    },
  ];
  if (e.commute) {
    out.push({
      label: 'Tempo de viagem',
      ok: e.commute.minutes <= c.maxCommuteMin,
      text: `${num(e.commute.minutes, 0)} min${e.fares && k.fares ? ' com as conduções pagas' : ''}; aceita até ${c.maxCommuteMin} min`,
      rule: k.commute,
    });
  }
  if (e.fares) {
    const { need, paid } = e.fares;
    out.push({
      label: 'Conduções',
      ok: need !== null && need <= paid,
      text:
        need === null
          ? `nem com ${2 * MAX_RIDES} por dia chega em ${c.maxCommuteMin} min; a vaga paga ${paid}`
          : `precisa de ${need} por dia${need === 0 ? ' (vai a pé)' : ''}; a vaga paga ${paid}`,
      rule: k.fares,
    });
  }
  out.push({ label: 'Competências', ok: skills.length === v.skills.length, text: `tem ${skills.length} de ${v.skills.length}${skills.length ? `: ${skills.join(', ')}` : ''}`, rule: false });
  return out;
}

function Ranking({ ranking, perspective, nameOf, vacancyOf, candidateOf, constraints, isMatched, active, onPick, weights, offerOf, canOffer, onOffer, onRespond, onCancel, legsOf }: RankingProps) {
  const [showFiltered, setShowFiltered] = useState(false);
  const feasible = ranking.filter((e) => e.feasible);
  const filtered = ranking.filter((e) => !e.feasible);
  const totalWeight = DIMENSIONS.reduce((s, d) => s + weights[d], 0);
  const isActive = (e: PairEvaluation) => active?.vacancyId === e.vacancyId && active.candidateId === e.candidateId;
  const withFares = ranking.some((e) => e.fares);

  const row = (e: PairEvaluation, rank?: number) => {
    const c = candidateOf(e);
    const timeOk = !e.commute || e.commute.minutes <= c.maxCommuteMin;
    const faresOk = !e.fares || (e.fares.need !== null && e.fares.need <= e.fares.paid);
    return (
      <li key={`${e.vacancyId}|${e.candidateId}`} className={isActive(e) ? 'open' : ''}>
        <button className={`vm-rank-row${withFares ? ' fares' : ''}`} onClick={() => onPick(e)} aria-expanded={isActive(e)}>
          <span className="vm-rank-n">{rank ?? '×'}</span>
          <span className="vm-rank-name">
            {nameOf(e)} {isMatched(e) && <span className="badge live">recomendado</span>}
            {offerOf(e) && <span className={`badge offer ${offerOf(e)}`}>{OFFER_BADGE[offerOf(e)!]}</span>}
          </span>
          <span className="vm-rank-score" title="Compatibilidade">{pct(e.score)}</span>
          <span className={`vm-rank-trip ${timeOk ? '' : 'bad'}`} title="Tempo de viagem até a vaga">
            {e.commute ? `${num(e.commute.minutes, 0)} min` : 'remoto'}
          </span>
          {withFares && (
            <span className={`vm-rank-fares ${faresOk ? '' : 'bad'}`} title="Conduções por dia: precisa / a vaga paga">
              {e.fares ? `${e.fares.need ?? `>${2 * MAX_RIDES}`}/${e.fares.paid}` : '—'}
            </span>
          )}
        </button>
        {isActive(e) && (
          <div className="vm-explain">
            <div className="vm-offer">
              {!offerOf(e) || offerOf(e) === 'recusada' ? (
                <button className="button" onClick={() => onOffer(e)} disabled={!canOffer(e)}>
                  {offerOf(e) === 'recusada' ? 'Ofertar de novo' : 'Ofertar esta vaga'}
                </button>
              ) : offerOf(e) === 'ofertada' ? (
                <>
                  <span className="muted small">Oferta enviada, aguardando resposta:</span>
                  <button className="button" onClick={() => onRespond(e, true)}>Aceitou</button>
                  <button className="button quiet" onClick={() => onRespond(e, false)}>Recusou</button>
                  <button className="vm-link" onClick={() => onCancel(e)}>cancelar oferta</button>
                </>
              ) : (
                <>
                  <span className="small">Contratado nesta vaga.</span>
                  <button className="vm-link" onClick={() => onCancel(e)}>desfazer</button>
                </>
              )}
              {!offerOf(e) && !canOffer(e) && <span className="muted small">{e.feasible ? 'Vaga cheia ou pessoa já contratada.' : 'Não cumpre uma regra obrigatória (✗ abaixo).'}</span>}
            </div>
            <ul className="vm-checks">
              {checksOf(e, vacancyOf(e), c, constraints).map((k) => (
                <li key={k.label} className={k.ok ? 'ok' : k.rule ? 'bad' : 'warn'}>
                  <i aria-hidden>{k.ok ? '✓' : k.rule ? '✗' : '!'}</i>
                  <strong>{k.label}</strong>
                  <span>
                    {k.text}
                    {!k.ok && !k.rule && <em> · não é regra obrigatória, só baixa a nota</em>}
                  </span>
                </li>
              ))}
            </ul>
            {legsOf(e) && <p className="small vm-trip">Trajeto: {legsText(legsOf(e)!)}.</p>}
            <details className="vm-why">
              <summary>Como a compatibilidade de {pct(e.score)} foi calculada</summary>
              <table className="vm-table">
                <thead>
                  <tr><th>Critério</th><th>Nota</th><th>Peso</th><th>Pontos</th><th>Por quê</th></tr>
                </thead>
                <tbody>
                  {DIMENSIONS.map((d) => (
                    <tr key={d}>
                      <td><i className="vm-swatch" style={{ background: DIM_COLOR[d] }} /> {DIMENSION_LABEL[d]}</td>
                      <td>{pct(e.dims[d].value)}</td>
                      <td>{totalWeight > 0 ? pct(weights[d] / totalWeight) : '—'}</td>
                      <td>{pct(e.contributions[d])}</td>
                      <td className="small">{e.dims[d].detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="small muted">Compatibilidade = soma dos pontos. Os pesos mudam em “Ajustes avançados”, abaixo.</p>
            </details>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="vm-ranking">
      <Heading>{perspective === 'vacancy' ? `Quem combina (${feasible.length})` : `Vagas que servem (${feasible.length})`}</Heading>
      <div className={`vm-rank-head${withFares ? ' fares' : ''}`} aria-hidden>
        <span />
        <span>{perspective === 'vacancy' ? 'Pessoa' : 'Vaga'}</span>
        <span>Combina</span>
        <span>Viagem</span>
        {withFares && <span title="Conduções por dia: precisa / a vaga paga">Cond.</span>}
      </div>
      <ol>{feasible.slice(0, 10).map((e, i) => row(e, i + 1))}</ol>
      {feasible.length === 0 && <p className="muted small">Ninguém cumpre todas as regras obrigatórias.</p>}
      {feasible.length > 10 && <p className="muted small">Mostrando as 10 mais compatíveis de {feasible.length}.</p>}
      {filtered.length > 0 && (
        <>
          <button className="vm-link" onClick={() => setShowFiltered(!showFiltered)}>
            {showFiltered ? 'Ocultar' : 'Ver'} {filtered.length} que não cumprem alguma regra
          </button>
          {showFiltered && <ol className="filtered">{filtered.map((e) => row(e))}</ol>}
        </>
      )}
    </div>
  );
}
