/**
 * O que o site mostra. Só entra aqui o que já funciona; o plano completo fica em docs/roadmap.md.
 *
 * - Testes (Lab): uma hipótese, um teste que roda na própria página e um veredito calculado.
 * - Projetos: sistemas completos rodando, para verificar de ponta a ponta.
 */

/** Onde o cálculo pode rodar. browser: custo zero. cloud-run: sob demanda, escala a zero. */
export type Runtime = 'browser' | 'cloud-run';

export interface LabTest {
  /** Âncora na página do Lab. */
  slug: string;
  title: string;
  hypothesis: string;
  topics: string[];
  href: string;
}

export interface Project {
  slug: string;
  title: string;
  /** Uma frase curta para os blocos visuais. */
  tagline: string;
  /** Categoria do roadmap a que o projeto pertence. */
  category: string;
  /** Tópicos efetivamente demonstrados (não a lista completa da categoria). */
  topics: string[];
  runtimes: Runtime[];
  href: string;
}

export const labTests: LabTest[] = [
  {
    slug: 'estabilidade',
    title: 'Ótimo × estável',
    hypothesis: 'Maximizar o score total deixa a alocação instável — e corrigir isso custa pouco.',
    topics: ['Hungarian Algorithm', 'Gale–Shapley', 'Stable Matching', 'Blocking Pairs'],
    href: '/lab#estabilidade',
  },
  {
    slug: 'linha-reta',
    title: 'Linha reta × rede viária',
    hypothesis: 'A distância em linha reta basta para estimar o tempo de deslocamento.',
    topics: ['Dijkstra', 'Travel Time', 'Linear Regression', 'Road Network'],
    href: '/lab#linha-reta',
  },
];

export const projects: Project[] = [
  {
    slug: 'vagas',
    title: 'Vagas e Candidatos',
    tagline: 'Quem combina com qual vaga — e por quê.',
    category: 'Geospatial Intelligence & Smart Matching',
    topics: [
      'Geographic Matching', 'Travel Time Scoring', 'Dijkstra', 'Constraint-Based Matching', 'Multi-Criteria Decision Analysis',
      'Weighted Scoring', 'Skill Matching', 'Education Matching', 'Schedule Compatibility', 'Candidate Ranking',
      'Vacancy Ranking', 'Top-K Retrieval', 'Bipartite Graph Matching', 'Hungarian Algorithm', 'Stable Matching',
      'Regional Demand Analysis',
    ],
    runtimes: ['browser', 'cloud-run'],
    href: '/projetos/vagas',
  },
  {
    slug: 'documentos',
    title: 'Foto de documento',
    tagline: 'A foto conferida antes do envio, no aparelho.',
    category: 'Computer Vision & Document Intelligence',
    topics: [
      'Document Detection', 'Perspective Correction', 'Homography', 'Blur Detection', 'Exposure Analysis',
      'Glare Detection', 'Orientation Detection', 'Web Workers', 'Live Camera Guidance', 'Auto Capture',
    ],
    runtimes: ['browser'],
    href: '/projetos/documentos',
  },
];

export const runtimeLabel: Record<Runtime, string> = {
  browser: 'navegador · custo zero',
  'cloud-run': 'Cloud Run · sob demanda',
};
