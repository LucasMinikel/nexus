import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ACHIEVEMENTS } from '../../lib/nexus-graph/terminal';
import { reducedMotion, streamDuration, type Entry, type useConsole } from './useConsole';
import './console.css';

type ConsoleState = ReturnType<typeof useConsole>;

interface Props {
  state: ConsoleState;
  inputRef: RefObject<HTMLInputElement | null>;
  chips: string[];
  /** Conteúdo extra no cabeçalho (botões de fechar, pausar…). */
  actions?: ReactNode;
  className?: string;
}

/** Linha escrita caractere a caractere, como a resposta de um modelo saindo em tokens. */
function StreamText({ text, delay }: { text: string; delay: number }) {
  const [shown, setShown] = useState(delay < 0 ? text.length : 0);
  useEffect(() => {
    if (delay < 0) return;
    if (reducedMotion()) {
      setShown(text.length);
      return;
    }
    let raf = 0;
    const start = performance.now() + delay;
    const duration = streamDuration(text);
    const step = (now: number) => {
      const k = duration === 0 ? 1 : Math.max(0, Math.min(1, (now - start) / duration));
      setShown(Math.round(k * text.length));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, delay]);
  const done = shown >= text.length;
  return (
    <>
      {text.slice(0, shown)}
      {!done && shown > 0 && <span className="cx-caret" />}
    </>
  );
}

function EntryLine({ e, run }: { e: Entry; run: (c: string) => void }) {
  if (e.command) {
    return (
      <div className="cx-line cmd">
        <span className="cx-prompt">›</span> {e.text}
      </div>
    );
  }
  const text = <StreamText text={e.text} delay={e.delay} />;
  if (e.run) {
    return (
      <button className={`cx-line link ${e.tone ?? ''}`} onClick={() => run(e.run!)}>
        {text}
      </button>
    );
  }
  if (e.href) {
    return (
      <a className={`cx-line link ${e.tone ?? ''}`} href={e.href}>
        {text}
      </a>
    );
  }
  return <div className={`cx-line ${e.tone ?? ''}`}>{text}</div>;
}

export default function ConsoleView({ state, inputRef, chips, actions, className = '' }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    // Acompanha a escrita enquanto a resposta sai.
    const follow = () => log.scrollTo({ top: log.scrollHeight });
    follow();
    const id = setInterval(follow, 120);
    const stop = setTimeout(() => clearInterval(id), 4000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [state.entries]);

  return (
    <div className={`cx ${state.busy ? 'busy' : ''} ${className}`} onClick={() => inputRef.current?.focus()}>
      <div className="cx-head">
        <span className="cx-dot" aria-hidden="true" />
        <span className="cx-title">Núcleo</span>
        <span className="cx-meta">{state.busy ? 'escrevendo…' : 'roda no seu navegador'}</span>
        <span className="cx-actions" onClick={(e) => e.stopPropagation()}>
          <button className="cx-trophy" onClick={() => state.run('achievements')} aria-label={`Conquistas: ${state.unlocked.length} de ${state.total}`}>
            <span aria-hidden="true">★ {state.unlocked.length}/{state.total}</span>
          </button>
          {actions}
        </span>
      </div>
      <div className="cx-log" ref={logRef} aria-live="polite">
        {state.entries.map((e) => (
          <EntryLine key={e.key} e={e} run={state.run} />
        ))}
      </div>
      <label className="cx-input">
        <span className="cx-prompt">›</span>
        <input
          ref={inputRef}
          value={state.input}
          onChange={(e) => state.setInput(e.target.value)}
          onKeyDown={state.onKeyDown}
          placeholder="pergunte algo ou digite um comando"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="Pergunta ou comando para o núcleo"
        />
        <kbd>↵</kbd>
      </label>
      <div className="cx-chips">
        {chips.map((c) => (
          <button key={c} onClick={(e) => (e.stopPropagation(), state.run(c))}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AchievementToast({ id }: { id: keyof typeof ACHIEVEMENTS | null }) {
  if (!id) return null;
  return (
    <div className="cx-toast" role="status">
      <span>★ conquista desbloqueada</span>
      <strong>{ACHIEVEMENTS[id].title}</strong>
    </div>
  );
}
