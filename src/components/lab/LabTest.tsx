import { useEffect, useRef, useState, type ReactNode } from 'react';
import './lab.css';

export type Verdict = 'confirmada' | 'refutada' | 'inconclusiva';

interface Props {
  id: string;
  index: number;
  hypothesis: string;
  verdict: Verdict;
  /** Regra que decide o veredito, em uma linha. */
  rule: string;
  source: string;
  children: ReactNode;
}

const REPO = 'https://github.com/LucasMinikel/nexus/blob/main/';

/** Moldura comum dos testes do Lab: hipótese, veredito calculado ao vivo, regra e código-fonte. */
export default function LabTest({ id, index, hypothesis, verdict, rule, source, children }: Props) {
  return (
    <article className="lt" id={id}>
      <p className="lt-index">
        <b>{String(index).padStart(2, '0')}</b>teste
      </p>
      <header className="lt-head">
        <h2 className="lt-hyp">{hypothesis}</h2>
        <span className={`lt-verdict ${verdict}`} aria-live="polite">
          {verdict === 'inconclusiva' ? 'rodando…' : verdict}
        </span>
      </header>
      {children}
      <footer className="lt-foot">
        <span>regra: {rule}</span>
        <a href={REPO + source}>
          <code>{source}</code>
        </a>
      </footer>
    </article>
  );
}

export function Stat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={`lt-stat ${hot ? 'hot' : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

/**
 * Roda `step` em lotes de até ~10 ms até `total` passos, para a página continuar
 * responsiva e o gráfico crescer enquanto o teste roda. Usa setTimeout, não
 * requestAnimationFrame: o cálculo não deve parar só porque a tela não está pintando.
 */
export function useBatchRunner(step: (i: number) => void, onDone?: () => void) {
  const timer = useRef(0);
  const stepRef = useRef(step);
  stepRef.current = step;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const stop = () => clearTimeout(timer.current);
  const start = (from: number, total: number) => {
    stop();
    let i = from;
    const tick = () => {
      const t0 = performance.now();
      while (i < total && performance.now() - t0 < 10) stepRef.current(i++);
      if (i < total) timer.current = window.setTimeout(tick, 0);
      else doneRef.current?.();
    };
    timer.current = window.setTimeout(tick, 0);
  };
  useEffect(() => stop, []);
  return { start, stop };
}

/**
 * Dispara `fn` uma vez ao montar. As ilhas do Lab usam client:visible, então montar
 * já significa estar na tela: o teste começa sozinho quando o visitante chega nele.
 */
export function useAutoStart(fn: () => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => fnRef.current(), []);
}

/**
 * Tamanho do gráfico em pixels reais do contêiner: o SVG é desenhado na largura em
 * que aparece, então eixos e textos mantêm o tamanho legível em qualquer tela.
 */
export function usePlotSize(initialWidth: number, aspect: number) {
  const ref = useRef<HTMLElement>(null);
  const [w, setW] = useState(initialWidth);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, W: w, H: Math.round(Math.min(340, Math.max(220, w * aspect))) };
}
