import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildGraph, type GraphItem } from '../../lib/nexus-graph/graph';
import type { Effect, Line } from '../../lib/nexus-graph/terminal';
import ConsoleView, { AchievementToast } from './ConsoleView';
import { useConsole } from './useConsole';
import './dock.css';

interface Props {
  items: GraphItem[];
  name: string;
}

const CHIPS = ['o que tem aqui?', 'abra o lab', 'abra os projetos', 'rode o matching', 'help'];

/** Evento que qualquer página dispara para abrir o console já com uma pergunta. */
export const ASK_EVENT = 'nexus:ask';
/** Evento do botão "Perguntar" do cabeçalho. */
export const OPEN_EVENT = 'nexus:open-console';

/**
 * Console do núcleo fora da home: Ctrl+K ou "/" abre. O grafo é o mesmo da home;
 * efeitos que precisam da cena 3D viram um link que leva o comando até ela.
 */
export default function CommandDock({ items, name }: Props) {
  const graph = useMemo(() => buildGraph(items, 7), [items]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<string | null>(null);

  const intro = useMemo<Line[]>(
    () => [
      { text: 'núcleo online · o mesmo console da home, em qualquer página', tone: 'accent' },
      { text: 'pergunte em português ou digite help. esc fecha.', tone: 'muted' },
    ],
    [],
  );

  const onEffects = useCallback((effects: Effect[], command: string): Line[] => {
    const scene = effects.filter((e) => ['pulse', 'path', 'think', 'agents', 'focus', 'stats', 'speed', 'pause'].includes(e.type));
    if (scene.length === 0) return [];
    return [{ text: 'ver isto na rede 3D →', tone: 'accent', href: `/?cmd=${encodeURIComponent(command)}` }];
  }, []);

  const state = useConsole({ graph, name, intro, onEffects });
  const { run } = state;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const onAsk = (e: Event) => {
      pendingRef.current = (e as CustomEvent<string>).detail;
      setOpen(true);
    };
    const onOpen = () => setOpen(true);
    addEventListener('keydown', onKey);
    addEventListener(ASK_EVENT, onAsk);
    addEventListener(OPEN_EVENT, onOpen);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener(ASK_EVENT, onAsk);
      removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // Ao fechar, o foco volta para quem abriu o console.
  const openerRef = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) {
      (openerRef.current as HTMLElement | null)?.focus?.();
      return;
    }
    openerRef.current = document.activeElement;
    inputRef.current?.focus();
    if (pendingRef.current) {
      run(pendingRef.current);
      pendingRef.current = null;
    }
  }, [open, run]);

  return (
    <>
      {open && (
        <div className="dock" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="dock-panel" role="dialog" aria-modal="true" aria-label="Console do núcleo">
            <ConsoleView
              state={state}
              inputRef={inputRef}
              chips={CHIPS}
              actions={
                <button onClick={() => setOpen(false)} aria-label="Fechar console">
                  esc
                </button>
              }
            />
          </div>
        </div>
      )}
      <AchievementToast id={state.toast} />
    </>
  );
}
