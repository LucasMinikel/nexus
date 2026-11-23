/**
 * Baixa do OpenStreetMap (Overpass) as linhas de transporte público de cada cidade, UMA vez:
 * relações de rota (ônibus, trólebus, metrô, trem, VLT, bonde, monotrilho), as paradas e o trajeto
 * (geometria das vias): no OSM muitas linhas têm o trajeto completo, mas poucas paradas mapeadas.
 * Resultado bruto em .cache/osm/<id>.transit.json (fora do git). Já baixadas são puladas.
 * Uso: node scripts/maps/fetch-transit.mjs [id ...]
 * Dados © colaboradores do OpenStreetMap, licença ODbL.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { bbox, CITIES } from './cities.mjs';

const OUT = '.cache/osm';
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const city of CITIES.filter((c) => only.length === 0 || only.includes(c.id))) {
  const file = `${OUT}/${city.id}.transit.json`;
  if (existsSync(file)) continue;
  const b = bbox(city).map((v) => v.toFixed(5)).join(',');
  const query = `[out:json][timeout:240];
relation["type"="route"]["route"~"^(bus|trolleybus|subway|train|light_rail|tram|monorail)$"](${b})->.r;
.r out body qt;
node(r.r); out skel qt;
way(r.r); out geom qt;`;
  for (let attempt = 1; ; attempt++) {
    const t = Date.now();
    // Queda de conexão conta como tentativa falha, igual a um erro HTTP.
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'User-Agent': 'nexus-map-build/0.1 (one-time local preprocessing)', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
    }).catch((e) => ({ ok: false, status: e.cause?.code ?? 'rede', text: async () => '' }));
    const text = await res.text().catch(() => '');
    if (res.ok && text.startsWith('{')) {
      writeFileSync(file, text);
      console.log(`${city.id}: ${(text.length / 1e6).toFixed(1)} MB em ${((Date.now() - t) / 1000).toFixed(0)} s`);
      break;
    }
    console.log(`${city.id}: HTTP ${res.status}, tentativa ${attempt}`);
    if (attempt === 5) break;
    await sleep(30000 * attempt);
  }
  await sleep(8000);
}
