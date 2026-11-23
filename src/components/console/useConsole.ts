import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Graph } from '../../lib/nexus-graph/graph';
import { ACHIEVEMENTS, complete, execute, type AchievementId, type Effect, type Line } from '../../lib/nexus-graph/terminal';

export interface Entry extends Line {
  key: number;
  command?: boolean;
  /**
   * Atraso (ms) antes de a linha começar a ser escrita, para as linhas de uma resposta saírem em sequência.
   * -1: a linha já nasce escrita (introdução), inclusive no HTML gerado no build.
   */
  delay: number;
}

interface Options {
  graph: Graph;
  name: string;
  intro: Line[];
  /**
   * Efeitos visuais (onda, caminho, atenção…). Devolve linhas extras para imprimir,
   * por exemplo quando a página não tem cena e oferece levar o comando até a home.
   */
  onEffects: (effects: Effect[], command: string) => Line[] | void;
  /** Atraso antes de navegar, para a câmera ter tempo de voar até o nó. */
  navigateDelay?: () => number;
}

const STORAGE_KEY = 'nexus:achievements';
/** Caracteres por milissegundo da escrita das respostas. */
export const STREAM_RATE = 0.12;

/**
 * Estado do console do núcleo: histórico, autocompletar, conquistas e a escrita em
 * sequência das respostas. Compartilhado entre a home e o console das outras páginas.
 */
export function useConsole({ graph, name, intro, onEffects, navigateDelay }: Options) {
  const keyRef = useRef(0);
  const [entries, setEntries] = useState<Entry[]>(() => intro.map((l) => ({ ...l, key: keyRef.current++, delay: -1 })));
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [unlocked, setUnlocked] = useState<AchievementId[]>([]);
  const [toast, setToast] = useState<AchievementId | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setUnlocked(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
    } catch {}
  }, []);

  const print = useCallback((lines: Line[], command?: string) => {
    const fresh = withDelays(lines, keyRef);
    const last = fresh[fresh.length - 1];
    const total = last ? last.delay + streamDuration(last.text) : 0;
    if (!reducedMotion() && total > 0) {
      setBusy(true);
      setTimeout(() => setBusy(false), total);
    }
    setEntries((prev) =>
      [...prev, ...(command ? [{ key: keyRef.current++, text: command, command: true, delay: 0 }] : []), ...fresh].slice(-120),
    );
  }, []);

  const unlock = useCallback((id: AchievementId) => {
    setUnlocked((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setToast(id);
      setTimeout(() => setToast((t) => (t === id ? null : t)), 3200);
      return next;
    });
  }, []);

  const unlockedRef = useRef(unlocked);
  unlockedRef.current = unlocked;
  const onEffectsRef = useRef(onEffects);
  onEffectsRef.current = onEffects;
  const navigateDelayRef = useRef(navigateDelay);
  navigateDelayRef.current = navigateDelay;

  const run = useCallback(
    (command: string) => {
      const result = execute(command, graph, { name, unlocked: unlockedRef.current });
      const visual: Effect[] = [];
      for (const e of result.effects) {
        if (e.type === 'achievement') unlock(e.id);
        else if (e.type === 'clear') setEntries([]);
        else if (e.type === 'navigate') setTimeout(() => (location.href = e.href), reducedMotion() ? 0 : (navigateDelayRef.current?.() ?? 0));
        else visual.push(e);
      }
      const extra = visual.length ? onEffectsRef.current(visual, command) : undefined;
      if (result.effects.some((e) => e.type === 'clear')) return;
      print([...result.lines, ...(extra ?? [])], command);
    },
    [graph, name, print, unlock],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const command = input.trim();
      if (!command) return;
      run(command);
      setHistory((h) => [...h, command].slice(-50));
      setHistoryIndex(-1);
      setInput('');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      setInput(complete(input, graph));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (history.length === 0) return;
      const next = e.key === 'ArrowUp' ? (historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1)) : historyIndex + 1;
      if (next >= history.length || next < 0) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        setHistoryIndex(next);
        setInput(history[next]);
      }
    } else if (e.key === 'Escape') {
      e.currentTarget.blur();
    }
  };

  return {
    entries,
    input,
    setInput,
    onKeyDown,
    run,
    print,
    unlock,
    unlocked,
    toast,
    busy,
    total: Object.keys(ACHIEVEMENTS).length,
  };
}

/** Duração da escrita de uma linha: proporcional ao tamanho, com teto para respostas longas não arrastarem. */
export const streamDuration = (text: string) => Math.min(600, text.length / STREAM_RATE);

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function withDelays(lines: Line[], keyRef: { current: number }): Entry[] {
  let at = 0;
  return lines.map((l) => {
    const entry = { ...l, key: keyRef.current++, delay: at };
    at += streamDuration(l.text) + 40;
    return entry;
  });
}
