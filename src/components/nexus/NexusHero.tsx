import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildGraph, type GraphItem } from '../../lib/nexus-graph/graph';
import type { Effect, Line } from '../../lib/nexus-graph/terminal';
import ConsoleView, { AchievementToast } from '../console/ConsoleView';
import { reducedMotion, useConsole } from '../console/useConsole';
import type { NexusScene } from './NexusScene';
import './NexusHero.css';

interface Props {
  items: GraphItem[];
  name: string;
}

const CHIPS = ['o que tem aqui?', 'rode o matching', 'caminho do lab até vagas', 'solte 300 agentes', 'help'];
const KIND_LABEL = { core: 'núcleo', section: 'seção', experiment: 'teste', project: 'projeto', dust: 'nó' } as const;

export default function NexusHero({ items, name }: Props) {
  const graph = useMemo(() => buildGraph(items, 7), [items]);
  const labeled = useMemo(() => graph.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.label), [graph]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<NexusScene | null>(null);
  const labelRefs = useRef(new Map<number, HTMLElement>());
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [has3d, setHas3d] = useState(true);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(0);
  // Pôster: a mesma rede projetada em 2D, no HTML desde o build. Aparece antes do WebGL e no lugar dele.
  const poster = useMemo(() => {
    const p = graph.nodes.map((n) => {
      const k = 21 / (21 - n.pos[2]); // perspectiva aproximada da câmera inicial (z = 21)
      return [Math.round(n.pos[0] * k * 10) / 10, Math.round((1.5 - n.pos[1]) * k * 10) / 10] as const;
    });
    return { p, edges: graph.edges.map(([a, b]) => `M${p[a][0]} ${p[a][1]}L${p[b][0]} ${p[b][1]}`).join('') };
  }, [graph]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [readout, setReadout] = useState({ fps: 0, agents: 0, focus: '—' });
  const explored = useRef(new Set<number>());
  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selected;

  const intro = useMemo<Line[]>(
    () => [
      { text: 'núcleo online · roteador de intenções v0 · rodando no seu navegador', tone: 'accent' },
      { text: `grafo carregado: ${graph.nodes.length} nós, ${graph.edges.length} arestas`, tone: 'muted' },
      { text: 'pergunte em português ou digite help. clique num nó para disparar uma onda.', tone: 'muted' },
    ],
    [graph],
  );

  const onEffects = useCallback((effects: Effect[]): Line[] | void => {
    const scene = sceneRef.current;
    if (!scene) return [{ text: '(cena 3D indisponível neste navegador)', tone: 'muted' }];
    const extra: Line[] = [];
    for (const e of effects) {
      if (e.type === 'pulse') scene.pulse(e.node, e.layers);
      else if (e.type === 'think') {
        scene.think(e.attention);
        setReadout((r) => ({ ...r, focus: graph.nodes[e.attention[0].node].label ?? '—' }));
      } else if (e.type === 'path') scene.showPath(e.path);
      else if (e.type === 'focus') scene.focus(e.node);
      else if (e.type === 'agents') scene.setAgents(e.count);
      else if (e.type === 'speed') scene.setSpeed(e.value);
      else if (e.type === 'pause') {
        scene.setPaused(e.paused);
        setPaused(e.paused);
      } else if (e.type === 'stats') {
        const s = scene.stats();
        extra.push({ text: `${s.fps} fps · ${s.drawCalls} draw calls · ${s.triangles} triângulos · ${s.agents} agentes · bloom ${s.bloom ? 'ligado' : 'desligado'}`, tone: 'muted' });
      }
    }
    return extra;
  }, [graph]);

  const state = useConsole({ graph, name, intro, onEffects, navigateDelay: () => (sceneRef.current ? 750 : 0) });
  const { run, unlock } = state;

  // Cena 3D, carregada depois: o console já funciona enquanto o Three.js chega.
  useEffect(() => {
    let scene: NexusScene | null = null;
    let cancelled = false;
    import('./NexusScene').then(({ NexusScene, webglAvailable }) => {
      if (cancelled || !canvasRef.current) return;
      if (!webglAvailable()) {
        setHas3d(false);
        return;
      }
      scene = new NexusScene(canvasRef.current, graph, {
        onHover: setHovered,
        onClick: (node) => {
          const n = graph.nodes[node];
          setSelected(n.label ? node : null);
          run(`bfs ${n.label ? n.id : `#${n.id}`}`);
          explored.current.add(node);
          if (explored.current.size >= 5) unlock('explorer');
        },
        onFrame: (project) => {
          // onFrame roda antes de cada render; no 2º chamado o 1º quadro já está na tela.
          // Só então o pôster some: nunca há rótulo sem nó nem canvas vazio.
          if (readyRef.current < 2 && ++readyRef.current === 2) setReady(true);
          for (const [i, el] of labelRefs.current) {
            const p = project(i);
            const opacity = p.visible ? Math.max(0.15, Math.min(1, 1.6 - p.depth / 22)) : 0;
            el.style.transform = `translate(${p.x}px, ${p.y}px)`;
            el.style.opacity = String(opacity);
          }
          const sel = selectedRef.current;
          const card = cardRef.current;
          if (sel !== null && card) {
            const p = project(sel);
            // Perto da borda direita, o cartão abre para a esquerda do nó para não ser cortado.
            const flip = p.x + card.offsetWidth + 30 > (canvasRef.current?.clientWidth ?? 0);
            card.style.translate = flip ? 'calc(-100% - 18px) -50%' : '18px -50%';
            card.style.transform = `translate(${p.x}px, ${p.y}px)`;
            card.style.opacity = p.visible ? '1' : '0';
          }
        },
      });
      sceneRef.current = scene;
      // Comandos trazidos de outras páginas (?cmd=…) rodam quando a cena estiver pronta.
      const cmd = new URLSearchParams(location.search).get('cmd');
      if (cmd) {
        history.replaceState(null, '', location.pathname);
        setTimeout(() => run(cmd), reducedMotion() ? 0 : 400);
      }
    });
    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [graph, run, unlock]);

  // Leitura do HUD: uma vez por segundo basta.
  useEffect(() => {
    const id = setInterval(() => {
      const s = sceneRef.current?.stats();
      if (s) setReadout((r) => ({ ...r, fps: s.fps, agents: s.agents }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // "/", Ctrl+K e o botão "Perguntar" do cabeçalho focam o console da cena.
  useEffect(() => {
    const focus = () => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ block: 'nearest' });
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        focus();
      }
    };
    addEventListener('keydown', onKey);
    addEventListener('nexus:open-console', focus);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('nexus:open-console', focus);
    };
  }, []);

  const togglePause = () => onEffects([{ type: 'pause', paused: !paused }]);
  const selectedNode = selected !== null ? graph.nodes[selected] : null;

  return (
    <section className={`nx ${has3d ? '' : 'no3d'} ${ready ? 'ready' : ''}`} aria-label="Rede interativa com o núcleo de linguagem no centro">
      <div className="nx-stage">
        <svg className="nx-poster" viewBox="-17 -10 34 20" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <path d={poster.edges} />
          {graph.nodes.map((n, i) => (
            <circle key={i} cx={poster.p[i][0]} cy={poster.p[i][1]} r={n.kind === 'dust' ? 0.09 : n.kind === 'core' ? 0.7 : 0.38} className={n.kind} />
          ))}
        </svg>
        <canvas ref={canvasRef} className="nx-canvas" aria-hidden="true" />

        <div className="nx-labels" aria-hidden="true">
          {labeled.map(({ n, i }) => (
            <span
              key={i}
              ref={(el) => {
                if (el) labelRefs.current.set(i, el);
                else labelRefs.current.delete(i);
              }}
              className={`nx-label ${n.kind} ${hovered === i ? 'hot' : ''}`}
            >
              {n.kind === 'core' ? 'núcleo · linguagem' : n.label}
            </span>
          ))}
        </div>

        {selectedNode && (
          <div ref={cardRef} className="nx-card">
            <span className="nx-card-kind">{KIND_LABEL[selectedNode.kind]}</span>
            <strong>{selectedNode.label}</strong>
            {selectedNode.summary && <span className="nx-card-sum">{selectedNode.summary}</span>}
            <div className="nx-card-actions">
              {selectedNode.href && <button onClick={() => run(`open ${selectedNode.id}`)}>abrir →</button>}
              <button onClick={() => run(`path nexus ${selectedNode.id}`)}>caminho</button>
              <button onClick={() => setSelected(null)} aria-label="fechar">×</button>
            </div>
          </div>
        )}
      </div>

      <header className="nx-head">
        <p className="nx-eyebrow">{name} · laboratório aberto</p>
        <h1>
          Ideias testadas <em>na sua frente.</em>
        </h1>
        <p className="nx-sub">Hipóteses com veredito calculado no seu navegador e sistemas completos rodando. Esta rede é o mapa: clique num nó ou pergunte ao núcleo.</p>
        <div className="nx-cta">
          <a className="button" href="/lab">Ver os testes</a>
          <a className="button quiet" href="/projetos">Projetos</a>
        </div>
      </header>

      {/* Só valores medidos: uma linha aparece quando o número existe. */}
      <dl className="nx-readout" aria-label="Leitura da cena">
        <div><dt>nós</dt><dd>{graph.nodes.length}</dd></div>
        <div><dt>arestas</dt><dd>{graph.edges.length}</dd></div>
        {readout.fps > 0 && <div><dt>quadros/s</dt><dd>{readout.fps}</dd></div>}
        {readout.agents > 0 && <div><dt>agentes</dt><dd>{readout.agents}</dd></div>}
        {readout.focus !== '—' && <div><dt>atenção</dt><dd className="focus">{readout.focus}</dd></div>}
      </dl>
      <ConsoleView
        state={state}
        inputRef={inputRef}
        chips={CHIPS}
        className="nx-term"
        actions={
          has3d && (
            <button onClick={togglePause} aria-pressed={paused}>
              {paused ? 'retomar' : 'pausar'}
            </button>
          )
        }
      />

      <AchievementToast id={state.toast} />

    </section>
  );
}
