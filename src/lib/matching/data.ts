import { REGIONS, regionOf, type RegionId } from '../city/city';
import type { CityMap } from '../city/map';
import { syntheticCity } from '../city/synthetic';
import { rng, type Rng } from '../random';
import type { Candidate, Modality, Shift, Vacancy } from './types';

export { rng, type Rng };

interface AreaSpec {
  courses: string[];
  skills: string[];
  titles: string[];
}

export const AREAS: Record<string, AreaSpec> = {
  Tecnologia: {
    courses: ['Ciência da Computação', 'Sistemas de Informação', 'Engenharia de Software'],
    skills: ['JavaScript', 'Python', 'SQL', 'Git', 'React', 'Cloud'],
    titles: ['Estágio em Desenvolvimento', 'Estágio em Dados', 'Suporte Técnico'],
  },
  Administração: {
    courses: ['Administração', 'Ciências Contábeis', 'Economia'],
    skills: ['Excel', 'Atendimento', 'Finanças', 'Comunicação', 'Planejamento'],
    titles: ['Estágio Administrativo', 'Assistente Financeiro', 'Estágio em RH'],
  },
  Engenharia: {
    courses: ['Engenharia Civil', 'Engenharia Mecânica', 'Engenharia de Produção'],
    skills: ['AutoCAD', 'Excel', 'Gestão de Projetos', 'Normas Técnicas', 'Planejamento'],
    titles: ['Estágio em Obras', 'Estágio em Manutenção', 'Estágio em Processos'],
  },
  Saúde: {
    courses: ['Enfermagem', 'Farmácia', 'Nutrição'],
    skills: ['Atendimento', 'Primeiros Socorros', 'Biossegurança', 'Comunicação'],
    titles: ['Estágio Hospitalar', 'Estágio em Farmácia', 'Estágio em Nutrição Clínica'],
  },
  Design: {
    courses: ['Design', 'Publicidade e Propaganda', 'Arquitetura'],
    skills: ['Figma', 'Photoshop', 'Ilustração', 'UX', 'Comunicação'],
    titles: ['Estágio em Design', 'Estágio em UX', 'Designer Júnior'],
  },
};

const COMPANIES = ['Aurora', 'Vértice', 'Ipê', 'Horizonte', 'Pampa', 'Atlas', 'Sereno', 'Cedro', 'Brisa', 'Lumen', 'Orla', 'Trilha'];
const NAMES = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabriela', 'Heitor', 'Isabela', 'João', 'Karen', 'Lucas',
  'Marina', 'Nicolas', 'Olívia', 'Paulo', 'Rafaela', 'Samuel', 'Tainá', 'Vitor', 'Yasmin', 'Igor', 'Luana', 'Mateus',
];
const SURNAMES = ['S.', 'M.', 'R.', 'O.', 'C.', 'L.', 'A.', 'P.', 'F.', 'B.'];
const BENEFITS = ['Vale-transporte', 'Vale-refeição', 'Plano de saúde', 'Auxílio home office', 'Seguro de vida'];
const SHIFTS: Shift[] = ['manha', 'tarde', 'noite'];
const REGION_IDS = Object.keys(REGIONS) as RegionId[];

const hashText = (t: string) => [...t].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7) >>> 0;

function gaussian(r: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - r.next())) * Math.cos(2 * Math.PI * r.next());
}

export function makeVacancy(r: Rng, id: string, city: CityMap = syntheticCity()): Vacancy {
  const area = r.pick(Object.keys(AREAS));
  const spec = AREAS[area];
  const hub = r.pick(city.hubs);
  const primary = r.pick(spec.courses);
  const otherCourses = r.sample(spec.courses.filter((c) => c !== primary), r.int(0, 2));
  const shiftStart = r.int(0, 2);
  const modality: Modality = r.next() < 0.65 ? 'presencial' : r.next() < 0.6 ? 'hibrido' : 'remoto';
  return {
    id,
    title: r.pick(spec.titles),
    company: r.pick(COMPANIES),
    pos: city.place({ x: hub.x + gaussian(r) * 1.3, y: hub.y + gaussian(r) * 1.3 }),
    area,
    courses: [primary, ...otherCourses],
    skills: r.sample(spec.skills, r.int(2, 3)),
    shifts: SHIFTS.slice(shiftStart, Math.min(3, shiftStart + r.int(1, 2))),
    modality,
    stipend: 900 + r.int(0, 14) * 100,
    // Vale-transporte sai da lista: vira `fares`, quantas conduções a vaga paga.
    benefits: r.sample(BENEFITS, r.int(1, 3)).filter((b) => b !== 'Vale-transporte'),
    // Sorteio à parte (não consome `r`): os cenários de antes, e as medições do Lab feitas com eles, não mudam.
    // A maioria paga 4 por dia (duas por sentido); algumas só 2, outras 6.
    fares: modality === 'remoto' ? 0 : rng(hashText(id + area)).pick([2, 4, 4, 4, 6]),
    slots: r.int(1, 3),
  };
}

export function makeCandidate(r: Rng, id: string, city: CityMap = syntheticCity()): Candidate {
  const area = r.pick(Object.keys(AREAS));
  const spec = AREAS[area];
  const pos = city.place({ x: r.next() * city.km, y: r.next() * city.km });
  const home = regionOf(pos, city);
  const otherAreas = r.sample(Object.keys(AREAS).filter((a) => a !== area), r.int(0, 1));
  const modalities: Modality[] = r.next() < 0.75 ? ['presencial', 'hibrido', 'remoto'] : r.pick([['remoto'], ['hibrido', 'remoto']] as Modality[][]);
  return {
    id,
    name: `${r.pick(NAMES)} ${r.pick(SURNAMES)}`,
    pos,
    preferredRegions: [home, ...r.sample(REGION_IDS.filter((x) => x !== home), r.int(0, 2))],
    course: r.pick(spec.courses),
    skills: r.sample(spec.skills, r.int(1, 4)),
    availability: r.sample(SHIFTS, r.int(1, 3)),
    maxCommuteMin: r.pick([30, 45, 60, 75]),
    modalities,
    desiredStipend: 1000 + r.int(0, 10) * 100,
    interests: [area, ...otherAreas],
  };
}

export interface Scenario {
  vacancies: Vacancy[];
  candidates: Candidate[];
}

export function makeScenario(seed: number, vacancyCount: number, candidateCount: number, city: CityMap = syntheticCity()): Scenario {
  const r = rng(seed);
  return {
    vacancies: Array.from({ length: vacancyCount }, (_, i) => makeVacancy(r, `V${i + 1}`, city)),
    candidates: Array.from({ length: candidateCount }, (_, i) => makeCandidate(r, `I${i + 1}`, city)),
  };
}

export interface RegionBalance {
  region: RegionId;
  slots: number;
  candidates: number;
  /** Postos por candidato. > 1: sobram vagas; < 1: sobram candidatos. */
  ratio: number;
}

/** Oferta (postos presenciais/híbridos) vs. demanda (residentes) por região. */
export function regionalBalance(s: Scenario, city: CityMap = syntheticCity()): RegionBalance[] {
  return REGION_IDS.map((region) => {
    const slots = s.vacancies
      .filter((v) => v.modality !== 'remoto' && regionOf(v.pos, city) === region)
      .reduce((n, v) => n + v.slots, 0);
    const candidates = s.candidates.filter((c) => regionOf(c.pos, city) === region).length;
    return { region, slots, candidates, ratio: candidates === 0 ? (slots > 0 ? Infinity : 1) : slots / candidates };
  });
}
