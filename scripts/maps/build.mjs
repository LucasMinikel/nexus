/**
 * Converte o bruto do OpenStreetMap (.cache/osm) no mapa compacto que o site carrega (public/maps).
 * Roda offline. Uso: node scripts/maps/build.mjs [id ...]
 *
 * - Projeção local equiretangular em km a partir do centro; x para leste, y para o sul (como no SVG).
 * - Vértices da rede = cruzamentos e pontas; trechos de mesma classe entre cruzamentos viram uma aresta.
 * - Mão única é ignorada (o modelo é de deslocamento porta a porta, não de navegação de carro).
 * - Só o maior componente conectado fica: todo ponto alcança todo ponto.
 * - Coordenadas em metros inteiros; geometria simplificada (Douglas–Peucker, 4 m).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { CITIES, KM } from './cities.mjs';

const SRC = '.cache/osm';
const OUT = 'public/maps';
mkdirSync(OUT, { recursive: true });

/** Classe da via: 0 expressa · 1 arterial · 2 coletora · 3 terciária · 4 local · 5 compartilhada. */
const CLASS = {
  motorway: 0, trunk: 0, motorway_link: 0, trunk_link: 0,
  primary: 1, primary_link: 1,
  secondary: 2, secondary_link: 2,
  tertiary: 3, tertiary_link: 3,
  unclassified: 4, residential: 4,
  living_street: 5,
};

function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  let max = -1, at = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
    if (d > max) { max = d; at = i; }
  }
  if (max <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
}

function build(city) {
  const raw = JSON.parse(readFileSync(`${SRC}/${city.id}.json`, 'utf8'));
  const M = KM * 1000;
  const kx = 111320 * Math.cos((city.lat * Math.PI) / 180), ky = 110574;
  const proj = (lat, lon) => [Math.round((lon - city.lon) * kx + M / 2), Math.round((city.lat - lat) * ky + M / 2)];
  const inside = ([x, y]) => x >= 0 && y >= 0 && x <= M && y <= M;

  const nodePos = new Map();
  const roads = [];
  const water = [];
  for (const el of raw.elements) {
    if (el.type === 'node') nodePos.set(el.id, proj(el.lat, el.lon));
    else if (el.type === 'way' && el.geometry) {
      const t = el.tags ?? {};
      const kind = t.natural === 'coastline' ? 2 : t.waterway === 'river' || t.waterway === 'canal' ? 1 : 0;
      const closed = el.nodes ? el.nodes[0] === el.nodes[el.nodes.length - 1] : false;
      const pts = el.geometry.filter(Boolean).map((g) => proj(g.lat, g.lon));
      water.push({ kind: kind === 0 && !closed ? 1 : kind, closed: kind === 0 && closed, pts: simplify(pts, 6) });
    } else if (el.type === 'way' && el.tags?.highway in CLASS) {
      roads.push({ cls: CLASS[el.tags.highway], nodes: el.nodes });
    }
  }

  // Quebra cada via nos nós fora do quadrado; conta uso de cada nó para achar cruzamentos.
  const pieces = [];
  for (const r of roads) {
    let cur = [];
    for (const id of r.nodes) {
      const p = nodePos.get(id);
      if (p && inside(p)) cur.push(id);
      else { if (cur.length > 1) pieces.push({ cls: r.cls, nodes: cur }); cur = []; }
    }
    if (cur.length > 1) pieces.push({ cls: r.cls, nodes: cur });
  }
  const uses = new Map();
  for (const p of pieces) p.nodes.forEach((id, i) => uses.set(id, (uses.get(id) ?? 0) + (i === 0 || i === p.nodes.length - 1 ? 2 : 1)));

  // Arestas entre vértices (nó usado mais de uma vez ou ponta).
  const vIndex = new Map();
  const verts = [];
  const vert = (id) => {
    let v = vIndex.get(id);
    if (v === undefined) { v = verts.length; vIndex.set(id, v); verts.push(nodePos.get(id)); }
    return v;
  };
  let edges = [];
  for (const p of pieces) {
    let start = 0;
    for (let i = 1; i < p.nodes.length; i++) {
      if (uses.get(p.nodes[i]) > 1 || i === p.nodes.length - 1) {
        const pts = p.nodes.slice(start, i + 1).map((id) => nodePos.get(id));
        const a = vert(p.nodes[start]), b = vert(p.nodes[i]);
        if (a !== b) edges.push({ a, b, cls: p.cls, pts });
        start = i;
      }
    }
  }

  // Maior componente conectado.
  const adj = verts.map(() => []);
  edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i); });
  const comp = new Int32Array(verts.length).fill(-1);
  let best = -1, bestSize = 0;
  for (let s = 0, c = 0; s < verts.length; s++) {
    if (comp[s] !== -1) continue;
    const stack = [s]; comp[s] = c; let size = 0;
    while (stack.length) {
      const u = stack.pop(); size++;
      for (const ei of adj[u]) { const e = edges[ei]; const w = e.a === u ? e.b : e.a; if (comp[w] === -1) { comp[w] = c; stack.push(w); } }
    }
    if (size > bestSize) { bestSize = size; best = c; }
    c++;
  }
  const sizes = new Map(); for (let v = 0; v < verts.length; v++) sizes.set(comp[v], (sizes.get(comp[v]) ?? 0) + 1);
  if (process.env.DEBUG_COMP) console.log(city.id, "componentes:", [...sizes.values()].sort((a, b) => b - a).slice(0, 5));
  edges = edges.filter((e) => comp[e.a] === best);

  // Contrai vértices de grau 2 entre arestas da mesma classe (curvas, emendas de vias).
  const inc = verts.map(() => new Set());
  edges.forEach((e, i) => { inc[e.a].add(i); inc[e.b].add(i); });
  const alive = edges.map(() => true);
  for (let v = 0; v < verts.length; v++) {
    if (inc[v].size !== 2) continue;
    const [i, j] = [...inc[v]];
    const e = edges[i], f = edges[j];
    if (e.cls !== f.cls) continue;
    const ea = e.a === v ? [...e.pts].reverse() : e.pts; // termina em v
    const fb = f.a === v ? f.pts : [...f.pts].reverse(); // começa em v
    const a = e.a === v ? e.b : e.a, b = f.a === v ? f.b : f.a;
    if (a === b) continue;
    const merged = { a, b, cls: e.cls, pts: [...ea, ...fb.slice(1)] };
    edges[i] = merged; alive[j] = false;
    inc[v].clear(); inc[b].delete(j); inc[b].add(i);
  }
  edges = edges.filter((_, i) => alive[i]);

  // Renumera só os vértices usados.
  const used = new Map();
  const nodes = [];
  const id = (v) => { let n = used.get(v); if (n === undefined) { n = used.size; used.set(v, n); nodes.push(...verts[v]); } return n; };
  const e = [], g = [];
  for (const ed of edges) {
    let len = 0;
    for (let k = 1; k < ed.pts.length; k++) len += Math.hypot(ed.pts[k][0] - ed.pts[k - 1][0], ed.pts[k][1] - ed.pts[k - 1][1]);
    e.push(id(ed.a), id(ed.b), ed.cls, Math.max(1, Math.round(len)));
    g.push(simplify(ed.pts, 4).slice(1, -1).flat());
  }

  // Polos de emprego: as células de 1 km com mais quilômetros de vias arteriais, afastadas entre si.
  const cells = new Map();
  edges.forEach((ed, k) => {
    if (ed.cls > 3) return;
    const [x, y] = ed.pts[Math.floor(ed.pts.length / 2)];
    const key = `${Math.min(KM - 1, Math.floor(x / 1000))},${Math.min(KM - 1, Math.floor(y / 1000))}`;
    cells.set(key, (cells.get(key) ?? 0) + e[k * 4 + 3] * (4 - ed.cls));
  });
  const hubs = [];
  for (const [key] of [...cells].sort((p, q) => q[1] - p[1])) {
    const [cx, cy] = key.split(',').map((s) => Number(s) * 1000 + 500);
    if (hubs.every(([hx, hy]) => Math.hypot(hx - cx, hy - cy) >= 2500)) hubs.push([cx, cy]);
    if (hubs.length === 3) break;
  }

  const w = water
    .filter((p) => p.pts.length > 1 && p.pts.some(inside))
    .map((p) => [p.closed ? 0 : p.kind, ...p.pts.flat()]);

  const out = { v: 1, id: city.id, name: city.name, uf: city.uf, lat: city.lat, lon: city.lon, km: KM, n: nodes, e, g, w, hubs };
  const json = JSON.stringify(out);
  writeFileSync(`${OUT}/${city.id}.json`, json);
  return { id: city.id, vertices: nodes.length / 2, edges: e.length / 4, water: w.length, kb: Math.round(json.length / 1024) };
}

/** Modos de transporte público, na ordem do índice gravado no arquivo. */
const MODES = ['bus', 'trolleybus', 'tram', 'light_rail', 'monorail', 'subway', 'train'];

/** Espaçamento dos pontos de embarque gerados ao longo do trajeto de ônibus, trólebus e bonde (m). */
const BUS_STOP_EVERY = 400;
/** Modos sobre trilho: só se embarca nas estações mapeadas. */
const RAIL = new Set(['light_rail', 'monorail', 'subway', 'train']);

/**
 * Linhas de transporte público. No OSM quase toda linha tem o trajeto (vias em ordem), mas poucas têm
 * as paradas. Ônibus: o trajeto é montado a partir das vias e ganha um ponto de embarque a cada
 * BUS_STOP_EVERY metros. Trilho: estações mapeadas, em ordem. Tudo recortado no quadrado: uma linha que
 * sai e volta vira dois trechos. Cada sentido é uma linha.
 */
function buildTransit(city) {
  const raw = JSON.parse(readFileSync(`${SRC}/${city.id}.transit.json`, 'utf8'));
  const M = KM * 1000;
  const kx = 111320 * Math.cos((city.lat * Math.PI) / 180), ky = 110574;
  const proj = (lat, lon) => [Math.round((lon - city.lon) * kx + M / 2), Math.round((city.lat - lat) * ky + M / 2)];
  const inside = ([x, y]) => x >= 0 && y >= 0 && x <= M && y <= M;
  const same = (a, b) => Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;
  const pos = new Map();
  const wayGeom = new Map();
  for (const el of raw.elements) {
    if (el.type === 'node') pos.set(el.id, proj(el.lat, el.lon));
    else if (el.type === 'way' && el.geometry) wayGeom.set(el.id, el.geometry.filter(Boolean).map((g) => proj(g.lat, g.lon)));
  }

  /** Trajeto contínuo a partir das vias em ordem; uma falha na sequência abre um novo trecho. */
  const chains = (r) => {
    const out = [];
    let path = null;
    let single = false; // o trecho ainda tem uma via só: a orientação dela pode ser invertida
    for (const m of r.members) {
      if (m.type !== 'way' || m.role.startsWith('platform')) continue;
      const g = wayGeom.get(m.ref);
      if (!g || g.length < 2) continue;
      if (path) {
        const last = path[path.length - 1];
        if (same(last, g[0])) { path.push(...g.slice(1)); single = false; continue; }
        if (same(last, g[g.length - 1])) { path.push(...[...g].reverse().slice(1)); single = false; continue; }
        if (single && same(path[0], g[0])) { path.reverse(); path.push(...g.slice(1)); single = false; continue; }
        if (single && same(path[0], g[g.length - 1])) { path.reverse(); path.push(...[...g].reverse().slice(1)); single = false; continue; }
        out.push(path);
      }
      path = [...g];
      single = true;
    }
    if (path) out.push(path);
    return out;
  };
  /** Pontos a cada `every` metros ao longo de um trecho (inclui as pontas). */
  const every = (pts, step) => {
    const out = [pts[0]];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      let d = step - carry;
      while (d <= len) {
        out.push([Math.round(ax + ((bx - ax) * d) / len), Math.round(ay + ((by - ay) * d) / len)]);
        d += step;
      }
      carry = (carry + len) % step;
    }
    const end = pts[pts.length - 1];
    if (!same(out[out.length - 1], end)) out.push(end);
    return out;
  };

  const lines = [];
  const seen = new Set();
  const add = (mode, r, piece) => {
    if (piece.length < 2) return;
    const key = mode + ':' + piece.flat().join(',');
    if (seen.has(key)) return;
    seen.add(key);
    lines.push([mode, String(r.tags.ref ?? '').slice(0, 12), String(r.tags.name ?? r.tags.ref ?? '').slice(0, 60), ...piece.flat()]);
  };
  for (const r of raw.elements) {
    if (r.type !== 'relation') continue;
    const mode = MODES.indexOf(r.tags.route);
    if (mode < 0) continue;
    if (RAIL.has(r.tags.route)) {
      const nodes = r.members.filter((m) => m.type === 'node' && pos.has(m.ref));
      const stops = nodes.filter((m) => m.role.startsWith('stop'));
      const chosen = stops.length >= 2 ? stops : nodes.filter((m) => m.role.startsWith('platform') || m.role === '');
      let piece = [];
      for (const m of chosen) {
        const p = pos.get(m.ref);
        if (!inside(p)) { add(mode, r, piece); piece = []; continue; }
        const last = piece[piece.length - 1];
        if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 80) continue; // mesma estação em dois papéis
        piece.push(p);
      }
      add(mode, r, piece);
      continue;
    }
    for (const path of chains(r)) {
      let piece = [];
      for (const p of path) {
        if (inside(p)) piece.push(p);
        else { if (piece.length > 1) add(mode, r, every(piece, BUS_STOP_EVERY)); piece = []; }
      }
      if (piece.length > 1) add(mode, r, every(piece, BUS_STOP_EVERY));
    }
  }
  const out = { v: 1, id: city.id, modes: MODES, lines };
  const json = JSON.stringify(out);
  // Cidade sem nenhuma linha mapeada no OSM: sem arquivo, e o site desativa o modo transporte público.
  if (lines.length === 0) rmSync(`${OUT}/${city.id}.transit.json`, { force: true });
  else writeFileSync(`${OUT}/${city.id}.transit.json`, json);
  const byMode = {};
  for (const l of lines) byMode[MODES[l[0]]] = (byMode[MODES[l[0]]] ?? 0) + 1;
  return { lines: lines.length, stops: lines.reduce((n, l) => n + (l.length - 3) / 2, 0), byMode, kb: Math.round(json.length / 1024) };
}

const only = process.argv.slice(2);
const built = [];
for (const c of CITIES.filter((c) => only.length === 0 || only.includes(c.id))) {
  if (!existsSync(`${SRC}/${c.id}.json`)) { console.log(`${c.id}: sem bruto, rode fetch.mjs`); continue; }
  const r = build(c);
  built.push(r);
  console.log(`${r.id}: ${r.vertices} vértices, ${r.edges} arestas, ${r.water} águas, ${r.kb} KB`);
  if (existsSync(`${SRC}/${c.id}.transit.json`)) {
    const t = buildTransit(c);
    console.log(`  transporte: ${t.lines} trechos de linha, ${t.stops} pontos de embarque ${JSON.stringify(t.byMode)}, ${t.kb} KB`);
  }
}
// Índice com todas as cidades que têm mapa gerado.
/** Abaixo disso o OSM da cidade tem linhas de menos: quase toda viagem sairia a pé, e o modo fica desligado. */
const MIN_TRANSIT_LINES = 40;
const transitLines = (id) => (existsSync(`${OUT}/${id}.transit.json`) ? JSON.parse(readFileSync(`${OUT}/${id}.transit.json`, 'utf8')).lines.length : 0);
const index = CITIES.filter((c) => existsSync(`${OUT}/${c.id}.json`)).map(({ id, name, uf, lat, lon }) => {
  const lines = transitLines(id);
  return { id, name, uf, lat, lon, transit: lines >= MIN_TRANSIT_LINES, transitLines: lines };
});
writeFileSync(`${OUT}/index.json`, JSON.stringify({ km: KM, source: 'OpenStreetMap (ODbL)', cities: index }));
