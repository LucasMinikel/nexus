/**
 * A grade sintética de city.ts no formato CityMap: usada pelos testes do Lab e pelos testes unitários.
 * Criada sob demanda (city.ts e este arquivo se importam mutuamente).
 */
import { buildNetwork, CITY_KM, GRID, nodePoint, RIVER_COL, RIVER_X, SPACING, nodeId, type Point } from './city';
import type { CityMap } from './map';

/** Polos de emprego: vagas concentram-se a leste e no centro, moradias espalham-se mais. */
const HUBS: Point[] = [
  { x: 7.5, y: 2 },
  { x: 6.5, y: 5 },
  { x: 3, y: 4.5 },
];

/** Nó mais próximo do mesmo lado do rio (não se atravessa o rio a pé). */
function nearest(p: Point): number {
  let col = Math.min(GRID - 1, Math.max(0, Math.round(p.x / SPACING)));
  const row = Math.min(GRID - 1, Math.max(0, Math.round(p.y / SPACING)));
  if (p.x < RIVER_X && col > RIVER_COL) col = RIVER_COL;
  if (p.x >= RIVER_X && col <= RIVER_COL) col = RIVER_COL + 1;
  return nodeId(col, row);
}

function place(p: Point): Point {
  let x = Math.min(CITY_KM - 0.2, Math.max(0.2, p.x));
  // Ninguém mora ou trabalha sobre o rio.
  if (Math.abs(x - RIVER_X) < 0.2) x = x < RIVER_X ? RIVER_X - 0.25 : RIVER_X + 0.25;
  // Arredonda a metros: Math.log/Math.cos podem diferir no último dígito entre motores JS,
  // e o cenário precisa ser idêntico no servidor (pré-renderização) e no navegador.
  const meters = (v: number) => Math.round(v * 1000) / 1000;
  return { x: meters(x), y: meters(Math.min(CITY_KM - 0.2, Math.max(0.2, p.y))) };
}

let city: CityMap | null = null;

export function syntheticCity(): CityMap {
  if (city) return city;
  const network = buildNetwork();
  city = {
    id: 'sintetica',
    name: 'Cidade sintética',
    km: CITY_KM,
    splitX: RIVER_X,
    network,
    segmentClass: network.segments.map((s) => (s.avenue ? 1 : 4)),
    segmentShape: network.segments.map(() => []),
    water: [{ kind: 1, pts: [{ x: RIVER_X, y: 0 }, { x: RIVER_X, y: CITY_KM }] }],
    hubs: HUBS,
    point: nodePoint,
    nearest,
    place,
  };
  return city;
}
