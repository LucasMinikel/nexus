import { useEffect, useMemo, useState } from 'react';
import type { CityMap } from '../../lib/city/map';
import { runMatching, sameAssignments, type MatchingRequest, type MatchingResponse, type MatchingResults } from '../../lib/matching/api';

const API = import.meta.env.PUBLIC_MATCHING_API_URL?.replace(/\/$/, '');
export const cloudAvailable = Boolean(API);
export const cloudHost = API ? new URL(API).host : null;

export type Target = 'browser' | 'cloud';

export type CloudState =
  | { status: 'idle' }
  | { status: 'waiting' | 'slow' }
  | {
      status: 'ok';
      forRequest: MatchingRequest;
      response: MatchingResponse;
      rttMs: number;
      sentBytes: number;
      receivedBytes: number;
    }
  | { status: 'error'; error: string };

const bytes = (s: string) => new TextEncoder().encode(s).length;

/**
 * Executa o cálculo de alocações no navegador ou no Cloud Run.
 * O navegador sempre calcula também: é o fallback e a verificação de que os dois dão o mesmo resultado.
 */
export function useExecution(request: MatchingRequest, target: Target, city: CityMap) {
  const local = useMemo(() => {
    const start = performance.now();
    const results = runMatching(request, city);
    return { results, ms: performance.now() - start, sentBytes: 0 };
  }, [request, city]);

  const [cloud, setCloud] = useState<CloudState>({ status: 'idle' });

  useEffect(() => {
    if (target !== 'cloud' || !API) return;
    const ctrl = new AbortController();
    let slow: ReturnType<typeof setTimeout> | undefined;
    // Debounce: arrastar um slider não deve disparar dezenas de requisições.
    const timer = setTimeout(async () => {
      setCloud((c) => (c.status === 'ok' ? c : { status: 'waiting' }));
      slow = setTimeout(() => setCloud((c) => (c.status === 'waiting' ? { status: 'slow' } : c)), 1500);
      const body = JSON.stringify(request);
      const start = performance.now();
      try {
        const res = await fetch(`${API}/match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: ctrl.signal,
        });
        const text = await res.text();
        const rttMs = performance.now() - start;
        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try {
            message = (JSON.parse(text) as { error?: string }).error ?? message;
          } catch {}
          throw new Error(message);
        }
        setCloud({
          status: 'ok',
          forRequest: request,
          response: JSON.parse(text) as MatchingResponse,
          rttMs,
          sentBytes: bytes(body),
          receivedBytes: bytes(text),
        });
      } catch (e) {
        if (!ctrl.signal.aborted) setCloud({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      } finally {
        clearTimeout(slow);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      clearTimeout(slow);
      ctrl.abort();
    };
  }, [request, target]);

  // Só usa a resposta da nuvem se ela corresponde ao estado atual; senão, mostra o cálculo local.
  const fresh = cloud.status === 'ok' && cloud.forRequest === request;
  const results: MatchingResults = target === 'cloud' && fresh ? cloud.response.results : local.results;
  const identical = cloud.status === 'ok' && fresh ? sameAssignments(local.results, cloud.response.results) : null;

  return { local, cloud, fresh, results, identical };
}
