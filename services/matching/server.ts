/// <reference types="node" />
/**
 * Serviço Cloud Run do experimento Vagas e Candidatos.
 *
 * Só processa uma coisa: o cálculo de correspondência deste experimento, em JSON,
 * vindo das origens do site. Arquivos, áudio, outros formatos e outros sites são recusados.
 * Escala a zero: sem requisições, não há instância ligada nem custo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { parseCityMap, type CityMap, type CityMapFile } from '../../src/lib/city/map';
import { syntheticCity } from '../../src/lib/city/synthetic';
import { parseTransit, withTransit, type TransitFile } from '../../src/lib/city/transit';
import { LIMITS, parseMatchingRequest, runMatching, ValidationError, type MatchingResponse } from '../../src/lib/matching/api';

const PORT = Number(process.env.PORT ?? 8080);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:4321').split(',').map((s) => s.trim());
const REVISION = process.env.K_REVISION ?? 'local';
/** Mapas das cidades (os mesmos arquivos de public/maps), carregados sob demanda e mantidos em memória. */
const MAPS_DIR = process.env.MAPS_DIR ?? 'public/maps';
const cities = new Map<string, CityMap>();

function cityFor(id: string | undefined, mode: 'car' | 'transit' = 'car'): CityMap {
  if (!id) {
    if (mode === 'transit') throw new ValidationError('mode: a cidade sintética não tem transporte público');
    return syntheticCity();
  }
  const key = `${id}:${mode}`;
  let c = cities.get(key);
  if (!c) {
    // O id já passou pela validação (só letras minúsculas e hífen): não há como escapar do diretório.
    const file = `${MAPS_DIR}/${id}.json`;
    if (!existsSync(file)) throw new ValidationError(`city: cidade sem mapa (${id})`);
    c = cities.get(`${id}:car`) ?? parseCityMap(JSON.parse(readFileSync(file, 'utf8')) as CityMapFile);
    cities.set(`${id}:car`, c);
    if (mode === 'transit') {
      const tf = `${MAPS_DIR}/${id}.transit.json`;
      if (!existsSync(tf)) throw new ValidationError(`mode: cidade sem transporte público (${id})`);
      c = withTransit(c, parseTransit(JSON.parse(readFileSync(tf, 'utf8')) as TransitFile));
      cities.set(key, c);
    }
  }
  return c;
}

let region = 'local';
let served = 0;

// No Cloud Run, a região vem do metadata server; fora dele, a consulta falha rápido.
fetch('http://metadata.google.internal/computeMetadata/v1/instance/region', {
  headers: { 'Metadata-Flavor': 'Google' },
  signal: AbortSignal.timeout(500),
})
  .then((r) => (r.ok ? r.text() : Promise.reject()))
  .then((t) => (region = t.split('/').pop() ?? region))
  .catch(() => {});

const buckets = new Map<string, { tokens: number; at: number }>();

/** Token bucket por IP: LIMITS.requestsPerMinute por minuto. */
function allow(ip: string): boolean {
  const now = Date.now();
  const rate = LIMITS.requestsPerMinute / 60_000;
  const b = buckets.get(ip) ?? { tokens: LIMITS.requestsPerMinute, at: now };
  b.tokens = Math.min(LIMITS.requestsPerMinute, b.tokens + (now - b.at) * rate);
  b.at = now;
  if (buckets.size > 10_000) buckets.clear();
  buckets.set(ip, b);
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function send(res: ServerResponse, status: number, body: unknown, origin?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  if (status === 413) headers['Connection'] = 'close';
  res.writeHead(status, headers).end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      // Acima do limite, descarta o restante sem guardar e responde 413.
      if (size > LIMITS.maxBodyBytes) reject(new Error('too-large'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : undefined;
  const url = new URL(req.url ?? '/', 'http://x');

  if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
  if (req.method === 'GET' && url.pathname === '/policy') {
    return send(res, 200, { accepts: 'application/json', endpoint: 'POST /match', limits: LIMITS, origins: ALLOWED_ORIGINS }, allowedOrigin);
  }
  if (url.pathname !== '/match') return send(res, 404, { error: 'Rota inexistente. Este serviço só oferece POST /match.' });

  if (req.method === 'OPTIONS') {
    if (!allowedOrigin) return send(res, 403, { error: 'Origem não permitida.' });
    res.writeHead(204, {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    });
    return res.end();
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' }, allowedOrigin);
  if (!allowedOrigin) return send(res, 403, { error: 'Origem não permitida: este serviço só atende o site NEXUS.' });
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
    return send(res, 415, { error: 'Só aceito JSON. Áudio, imagens e arquivos não são processados.' }, allowedOrigin);
  }
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
  if (!allow(ip)) return send(res, 429, { error: `Limite de ${LIMITS.requestsPerMinute} requisições por minuto.` }, allowedOrigin);

  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    const tooLarge = e instanceof Error && e.message === 'too-large';
    return send(res, tooLarge ? 413 : 400, { error: tooLarge ? `Corpo acima de ${LIMITS.maxBodyBytes} bytes.` : 'JSON inválido.' }, allowedOrigin);
  }

  try {
    const request = parseMatchingRequest(body);
    const start = performance.now();
    const results = runMatching(request, cityFor(request.city, request.mode));
    served += 1;
    const response: MatchingResponse = {
      results,
      server: { processingMs: performance.now() - start, coldStart: served === 1, region, revision: REVISION, instanceRequests: served },
    };
    return send(res, 200, response, allowedOrigin);
  } catch (e) {
    if (e instanceof ValidationError) return send(res, 422, { error: e.message }, allowedOrigin);
    console.error(JSON.stringify({ severity: 'ERROR', message: String(e) }));
    return send(res, 500, { error: 'Erro interno.' }, allowedOrigin);
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => console.log(JSON.stringify({ severity: 'INFO', message: `matching em :${PORT}`, origins: ALLOWED_ORIGINS })));
}
