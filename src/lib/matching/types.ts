import type { Commute, Point, RegionId } from '../city/city';

export type Shift = 'manha' | 'tarde' | 'noite';
export type Modality = 'presencial' | 'hibrido' | 'remoto';

export const SHIFT_LABEL: Record<Shift, string> = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
export const MODALITY_LABEL: Record<Modality, string> = { presencial: 'Presencial', hibrido: 'Híbrido', remoto: 'Remoto' };

export interface Vacancy {
  id: string;
  title: string;
  company: string;
  pos: Point;
  area: string;
  /** Cursos aceitos; o primeiro é o curso principal da vaga. */
  courses: string[];
  skills: string[];
  shifts: Shift[];
  modality: Modality;
  /** Bolsa ou remuneração mensal em R$. */
  stipend: number;
  benefits: string[];
  /**
   * Vale-transporte: conduções pagas por dia (ida e volta). 4 = duas na ida e duas na volta.
   * Só conta no transporte público.
   */
  fares: number;
  slots: number;
}

export interface Candidate {
  id: string;
  name: string;
  /** Localização aproximada da residência. */
  pos: Point;
  preferredRegions: RegionId[];
  course: string;
  skills: string[];
  availability: Shift[];
  maxCommuteMin: number;
  modalities: Modality[];
  desiredStipend: number;
  /** Áreas de atuação de interesse. */
  interests: string[];
}

export const DIMENSIONS = ['geo', 'professional', 'education', 'schedule', 'preferences'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABEL: Record<Dimension, string> = {
  geo: 'Geográfica',
  professional: 'Profissional',
  education: 'Educacional',
  schedule: 'Horário',
  preferences: 'Preferências',
};

export type Weights = Record<Dimension, number>;

/** Restrições obrigatórias. Quando ativas, atuam como filtro e não entram no score. */
export interface Constraints {
  modality: boolean;
  course: boolean;
  schedule: boolean;
  commute: boolean;
  fares: boolean;
}

export const CONSTRAINT_LABEL: Record<keyof Constraints, string> = {
  modality: 'Modalidade aceita pelo candidato',
  course: 'Curso aceito pela vaga',
  schedule: 'Disponibilidade cobre todos os turnos',
  commute: 'Deslocamento dentro do máximo do candidato',
  fares: 'Conduções pagas pela vaga cobrem o trajeto',
};

export interface DimensionScore {
  value: number;
  detail: string;
}

export interface PairEvaluation {
  vacancyId: string;
  candidateId: string;
  feasible: boolean;
  /** Restrições obrigatórias violadas (vazio quando feasible). */
  violations: string[];
  dims: Record<Dimension, DimensionScore>;
  /** Contribuição de cada dimensão para o score final (somam `score`). */
  contributions: Record<Dimension, number>;
  score: number;
  /** Ausente para vagas remotas. */
  commute: Commute | null;
  /**
   * Transporte público, vaga presencial ou híbrida: conduções por dia (ida e volta) que o candidato
   * precisa para chegar dentro do tempo máximo dele, e as que a vaga paga. `need` é null quando
   * nem com o máximo de conduções ele chega a tempo.
   */
  fares: { need: number | null; paid: number } | null;
}
