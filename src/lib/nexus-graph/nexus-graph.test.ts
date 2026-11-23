import { describe, expect, it } from 'vitest';
import { bfsLayers, buildGraph, findNode, shortestPath, type GraphItem } from './graph';
import { interpret } from './intent';
import { complete, execute } from './terminal';

const items: GraphItem[] = [
  { id: 'lab', label: 'Concepts Lab', kind: 'section', href: '/lab' },
  { id: 'projetos', label: 'Projetos', kind: 'section', href: '/projetos' },
  { id: 'blog', label: 'Blog', kind: 'section', href: '/blog' },
  { id: 'vacancy-matching', label: 'Vagas e Candidatos', kind: 'project', href: '/experimentos/vacancy-matching', parent: 'projetos' },
  { id: 'post-a', label: 'O melhor score total', kind: 'experiment', href: '/blog/a', parent: 'blog' },
];
const g = buildGraph(items, 3, 120);
const ctx = { name: 'Teste', unlocked: [] as const };

describe('buildGraph', () => {
  it('é conexo', () => {
    expect(bfsLayers(g, 0).flat().length).toBe(g.nodes.length);
  });

  it('é determinístico pelo seed', () => {
    expect(buildGraph(items, 3, 120).edges).toEqual(g.edges);
  });

  it('liga cada item à sua seção', () => {
    const exp = findNode(g, 'vacancy-matching');
    expect(g.adjacency[exp]).toContain(findNode(g, 'projetos'));
  });
});

describe('bfsLayers', () => {
  it('camada k tem exatamente os nós a k arestas', () => {
    const layers = bfsLayers(g, 0);
    const depth = new Map<number, number>();
    layers.forEach((l, k) => l.forEach((n) => depth.set(n, k)));
    for (const [a, b] of g.edges) expect(Math.abs(depth.get(a)! - depth.get(b)!)).toBeLessThanOrEqual(1);
    for (let k = 1; k < layers.length; k++) {
      for (const n of layers[k]) expect(g.adjacency[n].some((m) => depth.get(m) === k - 1)).toBe(true);
    }
  });
});

describe('shortestPath', () => {
  it('liga os extremos por arestas existentes', () => {
    const a = findNode(g, 'post-a');
    const b = findNode(g, 'vacancy-matching');
    const path = shortestPath(g, a, b);
    expect(path[0]).toBe(a);
    expect(path[path.length - 1]).toBe(b);
    for (let i = 1; i < path.length; i++) expect(g.adjacency[path[i - 1]]).toContain(path[i]);
  });
});

describe('findNode', () => {
  it('aceita nome sem acento e prefixo', () => {
    expect(findNode(g, 'vagas')).toBe(findNode(g, 'vacancy-matching'));
    expect(findNode(g, 'concepts lab')).toBe(findNode(g, 'lab'));
    expect(findNode(g, 'inexistente')).toBe(-1);
  });
});

describe('terminal', () => {
  it('bfs devolve a onda e a conquista', () => {
    const r = execute('bfs lab', g, ctx);
    expect(r.effects.map((e) => e.type)).toEqual(['pulse', 'achievement']);
  });

  it('open navega para a página do nó', () => {
    const r = execute('open vagas', g, ctx);
    expect(r.effects).toContainEqual({ type: 'navigate', href: '/experimentos/vacancy-matching' });
  });

  it('match roda o mesmo cálculo do experimento', () => {
    const r = execute('match 7', g, ctx);
    expect(r.lines.map((l) => l.text).join('\n')).toMatch(/hungarian\s+14 pares · score 11\.75 · 3 bloqueantes/);
  });

  it('valida argumentos', () => {
    expect(execute('agents 9999', g, ctx).lines[0].tone).toBe('error');
    expect(execute('path lab', g, ctx).lines[0].tone).toBe('error');
    expect(execute('xyz', g, ctx).lines[0].text).toMatch(/não encontrado/);
  });

  it('autocompleta comandos e nós', () => {
    expect(complete('ma', g)).toBe('match ');
    expect(complete('open vac', g)).toBe('open vacancy-matching ');
  });
});

describe('núcleo de linguagem', () => {
  const kw: GraphItem[] = items.map((i) =>
    i.id === 'vacancy-matching' ? { ...i, keywords: ['vagas', 'emprego'], summary: 'Quem combina com qual vaga.' } : i,
  );
  const gk = buildGraph(kw, 3, 120);

  it('atenção é uma distribuição em ordem decrescente', () => {
    const q = interpret('caminho do blog até as vagas', gk);
    const sum = q.attention.reduce((s, a) => s + a.weight, 0);
    expect(sum).toBeCloseTo(1, 5);
    for (let i = 1; i < q.attention.length; i++) expect(q.attention[i - 1].weight).toBeGreaterThanOrEqual(q.attention[i].weight);
  });

  it('frase vira o comando equivalente', () => {
    expect(interpret('caminho do blog até as vagas', gk).command).toBe('path blog vacancy-matching');
    expect(interpret('rode o matching', gk).command).toBe('match');
    expect(interpret('solte 250 agentes', gk).command).toBe('agents 250');
    expect(interpret('abra o lab', gk).command).toBe('open lab');
  });

  it('pergunta sobre um nó descreve em vez de executar', () => {
    const q = interpret('como funciona o emprego?', gk);
    expect(q.command).toBeNull();
    expect(gk.nodes[q.attention[0].node].id).toBe('vacancy-matching');
  });

  it('terminal manda frases ao núcleo e anima a atenção', () => {
    const r = execute('mostre o caminho do blog até vagas', gk, ctx);
    expect(r.effects.map((e) => e.type)).toEqual(['think', 'achievement', 'path', 'achievement']);
    expect(execute('qual é o emprego?', gk, ctx).lines.some((l) => l.text.includes('Quem combina'))).toBe(true);
  });
});
