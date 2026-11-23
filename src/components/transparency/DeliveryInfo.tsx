import { useEffect, useState } from 'react';
import './DeliveryInfo.css';

/** Data centers da Cloudflare mais prováveis para visitantes do Brasil e vizinhos. */
const COLO_CITY: Record<string, string> = {
  POA: 'Porto Alegre', GRU: 'São Paulo', GIG: 'Rio de Janeiro', CWB: 'Curitiba', FLN: 'Florianópolis',
  BSB: 'Brasília', CNF: 'Belo Horizonte', VCP: 'Campinas', SSA: 'Salvador', REC: 'Recife', FOR: 'Fortaleza',
  BEL: 'Belém', MAO: 'Manaus', GYN: 'Goiânia', SJP: 'São José do Rio Preto', QWJ: 'Americana', SJK: 'São José dos Campos',
  EZE: 'Buenos Aires', MVD: 'Montevidéu', SCL: 'Santiago', ASU: 'Assunção', LIM: 'Lima', BOG: 'Bogotá',
  MIA: 'Miami', IAD: 'Ashburn', LIS: 'Lisboa',
};

const PROBE = '__nexus_probe';

type Delivery =
  | { kind: 'loading' }
  | { kind: 'local' }
  | { kind: 'cdn'; colo: string; cacheStatus: string | null }
  | { kind: 'unknown' };

/**
 * static: arquivos do próprio site vindos do CDN (código das ilhas, imagens).
 * compute: chamadas a outro host, como o serviço Cloud Run.
 */
interface NetworkLog {
  static: number;
  compute: number;
  last: { host: string; path: string }[];
}

/** Painel de transparência, no rodapé de todas as páginas: fechado, ocupa uma linha. */
export default function DeliveryInfo() {
  const [open, setOpen] = useState(false);
  const [delivery, setDelivery] = useState<Delivery>({ kind: 'loading' });
  const [nav, setNav] = useState<{ transfer: number; ms: number; fromBrowserCache: boolean } | null>(null);
  const [net, setNet] = useState<NetworkLog>({ static: 0, compute: 0, last: [] });

  useEffect(() => {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (entry) {
      setNav({
        transfer: entry.transferSize,
        ms: entry.responseEnd - entry.startTime,
        fromBrowserCache: entry.transferSize === 0 && entry.decodedBodySize > 0,
      });
    }

    const host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      setDelivery({ kind: 'local' });
    } else {
      // HEAD na própria página: o cabeçalho cf-ray termina com o código do data center que respondeu.
      fetch(`${location.pathname}?${PROBE}`, { method: 'HEAD', cache: 'no-store' })
        .then((r) => {
          const ray = r.headers.get('cf-ray');
          const colo = ray?.split('-').pop();
          setDelivery(colo ? { kind: 'cdn', colo, cacheStatus: r.headers.get('cf-cache-status') } : { kind: 'unknown' });
        })
        .catch(() => setDelivery({ kind: 'unknown' }));
    }

    // Conta toda requisição feita depois do carregamento: prova de que os experimentos rodam localmente.
    const loadedAt = performance.now();
    const observer = new PerformanceObserver((list) => {
      const fresh = list
        .getEntries()
        .filter((e) => e.startTime >= loadedAt && !e.name.includes(PROBE))
        .map((e) => {
          const u = new URL(e.name);
          return { host: u.host, path: u.pathname };
        });
      if (fresh.length === 0) return;
      const compute = fresh.filter((r) => r.host !== location.host);
      setNet((n) => ({
        static: n.static + fresh.length - compute.length,
        compute: n.compute + compute.length,
        last: [...compute.reverse(), ...n.last].slice(0, 5),
      }));
    });
    observer.observe({ type: 'resource', buffered: false });
    return () => observer.disconnect();
  }, []);

  const where =
    delivery.kind === 'cdn'
      ? `CDN da Cloudflare em ${COLO_CITY[delivery.colo] ?? delivery.colo} (${delivery.colo})`
      : delivery.kind === 'local'
        ? 'servidor de desenvolvimento no seu computador'
        : delivery.kind === 'loading'
          ? 'verificando…'
          : 'CDN (data center não identificado)';

  return (
    <div className={`delivery ${open ? 'open' : ''}`}>
      <button className="delivery-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="dot" aria-hidden="true" />
        Como esta página chegou até você
        <span className="chev" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="delivery-panel">
          <dl>
            <dt>Entregue por</dt>
            <dd>{where}</dd>

            {nav && (
              <>
                <dt>Carregamento</dt>
                <dd>
                  {nav.fromBrowserCache
                    ? 'veio do cache do seu navegador: nenhum byte trafegou'
                    : `${(nav.transfer / 1024).toFixed(1)} KB em ${nav.ms.toFixed(0)} ms`}
                </dd>
              </>
            )}

            <dt>Chegou no servidor?</dt>
            <dd>
              {delivery.kind === 'local'
                ? 'Em produção, não: o HTML é um arquivo estático pronto, servido pelo CDN sem executar código.'
                : 'Não. O HTML é um arquivo estático já pronto, servido pelo CDN perto de você; nenhum servidor executou código para gerá-lo.'}
              {delivery.kind === 'cdn' && delivery.cacheStatus && <> Status do cache: <code>{delivery.cacheStatus}</code>.</>}
            </dd>

            <dt>Custo desta visita</dt>
            <dd>R$ 0 — o plano gratuito do Cloudflare Pages não cobra tráfego.</dd>

            <dt>Chamadas a servidores de processamento</dt>
            <dd>
              <strong>{net.compute}</strong>
              {net.compute === 0
                ? ' — tudo o que você fez até agora rodou no seu computador.'
                : ' (você escolheu executar algo na nuvem):'}
              {net.last.length > 0 && (
                <ul>
                  {net.last.map((r, i) => (
                    <li key={i}>
                      <code>{r.host}</code>
                      {r.path}
                    </li>
                  ))}
                </ul>
              )}
              {net.static > 0 && <div className="muted">+ {net.static} arquivo(s) do site baixados do CDN.</div>}
            </dd>
          </dl>
        </div>
      )}
    </div>
  );
}
