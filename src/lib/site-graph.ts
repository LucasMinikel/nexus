/**
 * Partes do site que viram nós da rede: usadas pela cena da home e pelo console
 * de todas as páginas, para os dois enxergarem o mesmo grafo.
 */
import { labTests, projects } from '../data/experiments';
import type { GraphItem } from './nexus-graph/graph';

const KEYWORDS: Record<string, string[]> = {
  estabilidade: ['estavel', 'estabilidade', 'otimo', 'hungarian', 'gale', 'shapley', 'bloqueantes', 'tese'],
  'linha-reta': ['linha', 'reta', 'distancia', 'tempo', 'deslocamento', 'rio', 'rota', 'regressao'],
  vagas: ['vagas', 'emprego', 'candidatos', 'interessados', 'estagio', 'aprendiz', 'mapa', 'score', 'alocacao'],
  documentos: ['documento', 'documentos', 'foto', 'camera', 'rg', 'cnh', 'borrada', 'nitidez', 'reflexo', 'analisar', 'verificar', 'doc-check'],
};

export function getSiteItems(): GraphItem[] {
  return [
    {
      id: 'lab',
      label: 'Lab',
      kind: 'section',
      href: '/lab',
      summary: 'Teses e algoritmos testados ao vivo, com veredito calculado na hora.',
      keywords: ['testes', 'teses', 'hipoteses', 'algoritmos', 'laboratorio', 'experimentos'],
    },
    {
      id: 'projetos',
      label: 'Projetos',
      kind: 'section',
      href: '/projetos',
      summary: 'Sistemas completos rodando, para verificar de ponta a ponta.',
      keywords: ['projetos', 'sistemas', 'aplicacoes', 'completos'],
    },
    ...labTests.map((t) => ({
      id: t.slug,
      label: t.title,
      kind: 'experiment' as const,
      href: t.href,
      parent: 'lab',
      summary: t.hypothesis,
      keywords: [...(KEYWORDS[t.slug] ?? []), ...t.topics],
    })),
    ...projects.map((p) => ({
      id: p.slug,
      label: p.title,
      kind: 'project' as const,
      href: p.href,
      parent: 'projetos',
      summary: p.tagline,
      keywords: [...(KEYWORDS[p.slug] ?? []), ...p.topics],
    })),
  ];
}
