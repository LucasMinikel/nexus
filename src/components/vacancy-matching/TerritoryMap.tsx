import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import type { Point } from '../../lib/city/city';
import type { CityMap } from '../../lib/city/map';
import type { Scenario } from '../../lib/matching/data';
import { MODALITY_LABEL } from '../../lib/matching/types';

/** Aparência de cada pessoa no mapa, calculada pelo dono do estado (status ou compatibilidade). */
export interface PersonLook {
  color: string;
  /** Anel de status: oferta pendente (gira), contratado (cheio), recusou (cortado). */
  ring?: 'offer' | 'hired' | 'declined';
  /** Etiqueta curta ao lado (ex.: "92%"). */
  tag?: string;
  dim?: boolean;
  /** Texto do cartão de hover. */
  summary: string;
}

export interface VacancyLook {
  filled: number;
  slots: number;
  summary: string;
}

/** Oferta ou resposta "voando" entre vaga e pessoa. */
export interface Flight {
  key: string;
  from: Point;
  to: Point;
  kind: 'offer' | 'accept' | 'decline';
  delayMs: number;
}

export interface PointBinding {
  ref: (el: SVGGElement | null) => void;
  role: string;
  tabIndex: number;
  'aria-label': string;
  'aria-pressed': boolean;
  onFocus: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onClick: (e: MouseEvent) => void;
}

interface Props {
  city: CityMap;
  scenario: Scenario;
  /** Muda a cada cenário novo: os pontos entram de novo, em sequência. */
  generation: number;
  roads: string[];
  showRoads: boolean;
  water: ReactNode;
  /** Camadas desenhadas sobre as ruas e sob os pontos (região, área, alcance, rota…). */
  under: ReactNode;
  people: Map<string, PersonLook>;
  vacancies: Map<string, VacancyLook>;
  /** Vagas apagadas (ex.: de outros clientes). */
  dimmedVacancies?: Set<string>;
  highlight: Set<string>;
  selectedVacancy?: string;
  flights: Flight[];
  bind: (kind: 'vacancy' | 'candidate', id: string, label: string) => PointBinding;
  adding: boolean;
  onPlace: (p: Point) => void;
  /** Painel sobre o mapa (legenda, contagens). */
  panel: ReactNode;
  /** Barra flutuante no rodapé do mapa (troca de visão). */
  dock: ReactNode;
  ariaLabel: string;
}

const labelText = (company: string, look: VacancyLook | undefined, slots: number) => `${company} · ${look ? `${look.filled}/${look.slots}` : slots}`;
/** Cargo encurtado para a segunda linha da etiqueta. */
const shortTitle = (t: string) => (t.length > 24 ? t.slice(0, 23) + '…' : t);
/** Largura da etiqueta de duas linhas (empresa · postos / cargo), em km na escala 1. */
const labelWidth = (l1: string, l2: string) => Math.max(l1.length * 0.092, l2.length * 0.074) + 0.36;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .replace(/[^A-Za-zÀ-ÿ]/g, '')
    .slice(0, 2)
    .toUpperCase();

/**
 * Mapa "território": ruas reais, pessoas como avatares coloridos e vagas com etiqueta e ocupação.
 * Zoom pelos botões e arrastar para mover; a roda do mouse continua rolando a página.
 * Os marcadores mantêm o tamanho na tela em qualquer zoom.
 */
export default function TerritoryMap(p: Props) {
  const KM = p.city.km;
  const full = { x: -0.3, y: -0.3, w: KM + 0.6 };
  const [view, setView] = useState(full);
  const [hover, setHover] = useState<{ id: string; kind: 'vacancy' | 'candidate'; left: number; top: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; view: typeof view; moved: boolean } | null>(null);
  const z = view.w / full.w;

  const zoom = (f: number) =>
    setView((v) => {
      const w = Math.min(full.w, Math.max(1.5, v.w * f));
      const cx = v.x + v.w / 2;
      const cy = v.y + v.w / 2;
      return clamp({ x: cx - w / 2, y: cy - w / 2, w });
    });
  const clamp = (v: typeof view) => ({
    w: v.w,
    x: Math.min(full.x + full.w - v.w, Math.max(full.x, v.x)),
    y: Math.min(full.y + full.w - v.w, Math.max(full.y, v.y)),
  });

  const toWorld = (clientX: number, clientY: number): Point | null => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || view.w >= full.w) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setHover(null);
    }
    const px = svgRef.current!.getBoundingClientRect().width / d.view.w;
    setView(clamp({ x: d.view.x - dx / px, y: d.view.y - dy / px, w: d.view.w }));
  };
  const onPointerUp = () => {
    // Mantém `moved` até o clique que vem logo depois, para ele ser ignorado.
    setTimeout(() => (drag.current = null), 0);
  };
  const onClickCapture = (e: MouseEvent) => {
    if (drag.current?.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!p.adding) return;
    const at = toWorld(e.clientX, e.clientY);
    if (at) p.onPlace({ x: Math.min(KM - 0.1, Math.max(0.1, at.x)), y: Math.min(KM - 0.1, Math.max(0.1, at.y)) });
  };

  const showHover = (kind: 'vacancy' | 'candidate', id: string, pos: Point) => {
    const svg = svgRef.current?.getBoundingClientRect();
    const wrap = wrapRef.current?.getBoundingClientRect();
    if (!svg || !wrap) return;
    const k = svg.width / view.w;
    setHover({ kind, id, left: svg.left - wrap.left + (pos.x - view.x) * k, top: svg.top - wrap.top + (pos.y - view.y) * k });
  };

  // Vagas no mesmo endereço (mesmo cliente, perfis diferentes): pinos lado a lado, não empilhados.
  const shown = (() => {
    const groups = new Map<string, string[]>();
    for (const v of p.scenario.vacancies) {
      const key = `${Math.round(v.pos.x * 20)},${Math.round(v.pos.y * 20)}`;
      groups.set(key, [...(groups.get(key) ?? []), v.id]);
    }
    const out = new Map<string, Point>();
    for (const v of p.scenario.vacancies) {
      const ids = groups.get(`${Math.round(v.pos.x * 20)},${Math.round(v.pos.y * 20)}`)!;
      const i = ids.indexOf(v.id);
      out.set(v.id, { x: v.pos.x + (i - (ids.length - 1) / 2) * 0.48 * z, y: v.pos.y });
    }
    return out;
  })();

  // Etiquetas das vagas sem sobreposição: tenta acima, abaixo, à direita e à esquerda do pino.
  const labelAt = (() => {
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const out = new Map<string, { dx: number; dy: number }>();
    const sorted = [...p.scenario.vacancies].sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
    for (const v of sorted) {
      const look = p.vacancies.get(v.id);
      const w = labelWidth(labelText(v.company, look, v.slots), shortTitle(v.title));
      const at = shown.get(v.id)!;
      const tries = [
        { dx: 0, dy: -0.52 },
        { dx: 0, dy: 0.52 },
        { dx: w / 2 + 0.3, dy: 0 },
        { dx: -(w / 2 + 0.3), dy: 0 },
        { dx: 0, dy: -0.95 },
        { dx: 0, dy: 0.95 },
      ];
      const box = (t: { dx: number; dy: number }) => ({
        x0: at.x + (t.dx - w / 2) * z,
        x1: at.x + (t.dx + w / 2) * z,
        y0: at.y + (t.dy - 0.25) * z,
        y1: at.y + (t.dy + 0.25) * z,
      });
      const free = (b: ReturnType<typeof box>) => placed.every((q) => b.x1 < q.x0 || b.x0 > q.x1 || b.y1 < q.y0 || b.y0 > q.y1);
      const inside = (b: ReturnType<typeof box>) => b.x0 >= view.x && b.x1 <= view.x + view.w && b.y0 >= view.y && b.y1 <= view.y + view.w;
      const pick = tries.find((t) => free(box(t)) && inside(box(t))) ?? tries.find((t) => inside(box(t))) ?? tries[0];
      placed.push(box(pick));
      out.set(v.id, pick);
    }
    return out;
  })();

  const hoverText =
    hover &&
    (hover.kind === 'candidate' ? p.people.get(hover.id)?.summary : p.vacancies.get(hover.id)?.summary);

  return (
    <div className="tm" ref={wrapRef}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.w}`}
        className={`tm-svg ${p.adding ? 'adding' : ''} ${view.w < full.w ? 'pannable' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClickCapture={onClickCapture}
        onClick={onClick}
        role="group"
        aria-label={p.ariaLabel}
        style={{ ['--z' as string]: z }}
      >
        <rect x={0} y={0} width={KM} height={KM} className="tm-land" />
        <clipPath id={`tm-clip-${p.city.id}`}>
          <rect x={0} y={0} width={KM} height={KM} />
        </clipPath>
        <g clipPath={`url(#tm-clip-${p.city.id})`}>
          {p.water}
          {p.showRoads && p.roads.map((d, cls) => d && <path key={cls} d={d} className={`vm-road c${cls}`} />)}
          {p.under}
        </g>

        {p.flights.map((f) => (
          <circle key={f.key} r={0.11 * z} className={`tm-flight ${f.kind}`} style={{ animationDelay: `${f.delayMs}ms` }}>
            <animateMotion dur="0.9s" begin={`${f.delayMs / 1000}s`} fill="freeze" path={`M${f.from.x},${f.from.y}L${f.to.x},${f.to.y}`} />
          </circle>
        ))}

        <g key={p.generation}>
          {p.scenario.candidates.map((c, i) => {
            const look = p.people.get(c.id);
            if (!look) return null;
            const hl = p.highlight.has(c.id);
            return (
              <g
                key={c.id}
                className={`vm-point tm-person ${look.dim ? 'dim' : ''} ${hl ? 'hl' : ''}`}
                transform={`translate(${c.pos.x} ${c.pos.y}) scale(${z})`}
                {...p.bind('candidate', c.id, `Candidato ${c.id}, ${c.name}. ${look.summary}`)}
                onPointerEnter={() => showHover('candidate', c.id, c.pos)}
                onPointerLeave={() => setHover(null)}
              >
                <g className="tm-pop" style={{ animationDelay: `${i * 18}ms` }}>
                  <circle r={0.42} className="vm-hit" />
                  {look.ring === 'offer' && <circle r={0.27} className="tm-ring offer" />}
                  {look.ring === 'hired' && <circle r={0.25} className="tm-ring hired" />}
                  {/* key com a cor: quando o estado muda, o avatar "pula". */}
                  <g key={look.color + (look.ring ?? '')} className="tm-bump">
                    <circle r={hl ? 0.22 : 0.18} style={{ fill: look.color }} className="tm-avatar" />
                    <text className="tm-initials" dy="0.055">
                      {initials(c.name)}
                    </text>
                  </g>
                  {look.ring === 'declined' && <path d="M0.13,-0.27 l0.14,0.14 m0,-0.14 l-0.14,0.14" className="tm-x" />}
                  {look.tag && (
                    <text x={0.24} y={-0.18} className="tm-tag">
                      {look.tag}
                    </text>
                  )}
                </g>
              </g>
            );
          })}

          {p.scenario.vacancies.map((v, i) => {
            const look = p.vacancies.get(v.id);
            const hl = p.highlight.has(v.id);
            const sel = p.selectedVacancy === v.id;
            const label = labelText(v.company, look, v.slots);
            const title = shortTitle(v.title);
            const at = labelAt.get(v.id) ?? { dx: 0, dy: -0.52 };
            const w = labelWidth(label, title);
            const pos = shown.get(v.id) ?? v.pos;
            const complete = look ? look.filled >= look.slots : false;
            return (
              <g
                key={v.id}
                className={`vm-point tm-job ${v.modality} ${hl ? 'hl' : ''} ${complete ? 'full' : ''} ${p.dimmedVacancies?.has(v.id) ? 'dim' : ''}`}
                transform={`translate(${pos.x} ${pos.y}) scale(${z})`}
                {...p.bind('vacancy', v.id, `Vaga ${v.id}, ${v.title}, ${v.company}, ${MODALITY_LABEL[v.modality]}. ${look?.summary ?? ''}`)}
                onPointerEnter={() => showHover('vacancy', v.id, pos)}
                onPointerLeave={() => setHover(null)}
              >
                <g className="tm-pop" style={{ animationDelay: `${300 + i * 40}ms` }}>
                  <circle r={0.45} className="vm-hit" />
                  {sel && <circle r={0.3} className="tm-pulse" />}
                  {/* Etiqueta: empresa e postos ocupados, sempre visível (como placa no mapa). */}
                  <g className="tm-label" transform={`translate(${at.dx} ${at.dy})`}>
                    <rect x={-w / 2} y={-0.23} width={w} height={0.46} rx={0.12} />
                    <circle cx={-w / 2 + 0.15} cy={-0.08} r={0.055} className="tm-label-dot" />
                    <text x={-w / 2 + 0.26} y={-0.03}>
                      {label}
                    </text>
                    <text x={-w / 2 + 0.26} y={0.15} className="tm-label-title">
                      {title}
                    </text>
                  </g>
                  <rect x={-0.2} y={-0.2} width={0.4} height={0.4} rx={0.08} className="tm-pin" />
                  <path d="M-0.09,-0.02 h0.18 v0.12 h-0.18 z M-0.04,-0.02 v-0.05 h0.08 v0.05" className="tm-briefcase" />
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="tm-panel">{p.panel}</div>
      <div className="tm-zoom" role="group" aria-label="Zoom do mapa">
        <button type="button" onClick={() => zoom(0.6)} aria-label="Aproximar">+</button>
        <button type="button" onClick={() => zoom(1 / 0.6)} aria-label="Afastar" disabled={view.w >= full.w}>−</button>
        <button type="button" onClick={() => setView(full)} aria-label="Ver o mapa inteiro" disabled={view.w >= full.w}>⤢</button>
      </div>
      <div className="tm-dock">{p.dock}</div>
      {hover && hoverText && (
        <div className="tm-hover" style={{ left: hover.left, top: hover.top }} role="tooltip">
          {hoverText}
        </div>
      )}
    </div>
  );
}
