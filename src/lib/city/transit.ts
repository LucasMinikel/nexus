/**
 * Transporte público sobre o mapa real: linhas do OpenStreetMap (public/maps/<id>.transit.json).
 *
 * Rede combinada: as ruas viram caminhada e cada parada de cada linha vira um nó próprio, para
 * que trocar de linha custe uma nova espera. Arestas, no sentido real da viagem:
 *   rua → parada da linha   caminhada até a parada + espera média (metade do intervalo)
 *   parada → parada seguinte  tempo no veículo (distância / velocidade média do modo)
 *   parada da linha → rua   caminhada da parada até a esquina
 * Ninguém sabe os horários: intervalo e velocidade são médias por modo (MODE_INFO).
 *
 * As arestas são guardadas INVERTIDAS: o Dijkstra a partir da vaga dá o tempo de cada ponto ATÉ a vaga,
 * que é o que o cálculo de deslocamento usa (as linhas têm sentido; ida e volta podem diferir).
 */
import { SPEED_KMH, type Edge, type Point } from './city';
import type { CityMap } from './map';

export const TRANSIT_MODES = ['bus', 'trolleybus', 'tram', 'light_rail', 'monorail', 'subway', 'train'] as const;
export type TransitMode = (typeof TRANSIT_MODES)[number];

/** Velocidade média com paradas (km/h) e espera média (min, metade do intervalo típico). Estimativas. */
export const MODE_INFO: Record<TransitMode, { label: string; speedKmh: number; waitMin: number; rail: boolean }> = {
  bus: { label: 'Ônibus', speedKmh: 18, waitMin: 8, rail: false },
  trolleybus: { label: 'Trólebus', speedKmh: 18, waitMin: 8, rail: false },
  tram: { label: 'Bonde', speedKmh: 20, waitMin: 6, rail: false },
  light_rail: { label: 'VLT', speedKmh: 25, waitMin: 5, rail: true },
  monorail: { label: 'Monotrilho', speedKmh: 30, waitMin: 4, rail: true },
  subway: { label: 'Metrô', speedKmh: 35, waitMin: 3, rail: true },
  train: { label: 'Trem', speedKmh: 40, waitMin: 6, rail: true },
};

export interface TransitLine {
  mode: TransitMode;
  ref: string;
  name: string;
  stops: Point[];
}

export interface TransitFile {
  v: 1;
  id: string;
  modes: string[];
  /** [modo, ref, nome, x, y, x, y…] em metros. */
  lines: (number | string)[][];
}

export function parseTransit(f: TransitFile): TransitLine[] {
  return f.lines.map(([mode, ref, name, ...xy]) => {
    const stops: Point[] = [];
    for (let i = 0; i < xy.length; i += 2) stops.push({ x: (xy[i] as number) / 1000, y: (xy[i + 1] as number) / 1000 });
    return { mode: f.modes[mode as number] as TransitMode, ref: String(ref), name: String(name), stops };
  });
}

/** Máximo de conduções por sentido consideradas (vale-transporte de até 6 por dia). */
export const MAX_RIDES = 3;

/** Cidade com transporte público: mesmas ruas (a pé), mais as linhas. */
export interface TransitCity extends CityMap {
  mode: 'transit';
  lines: TransitLine[];
  /** Número de nós de rua; nós a partir daqui são paradas. */
  streetCount: number;
  /** Linha de cada nó de parada (índice em `lines`), a partir de streetCount. */
  stopLine: Int32Array;
  /** A mesma cidade de carro (mesmos nós de rua), para comparar as opções de trajeto. */
  car: CityMap;
}

const walkMin = (km: number) => (km / SPEED_KMH.walk) * 60;

export function withTransit(base: CityMap, lines: TransitLine[]): TransitCity {
  const N = base.network.adjacency.length;
  const stopCount = lines.reduce((n, l) => n + l.stops.length, 0);
  const adjacency: Edge[][] = Array.from({ length: N + stopCount }, () => []);
  const stopLine = new Int32Array(stopCount);
  const stopPos: Point[] = [];
  // Guarda invertido: uma aresta real a → b vira adjacency[b] → a.
  const link = (a: number, b: number, km: number, minutes: number, board?: boolean) => adjacency[b].push(board ? { to: a, km, minutes, board } : { to: a, km, minutes });

  for (const s of base.network.segments) {
    const km = base.network.adjacency[s.a].find((e) => e.to === s.b)!.km;
    link(s.a, s.b, km, walkMin(km));
    link(s.b, s.a, km, walkMin(km));
  }

  let id = N;
  lines.forEach((line, li) => {
    const info = MODE_INFO[line.mode];
    line.stops.forEach((p, j) => {
      const node = id + j;
      stopLine[node - N] = li;
      stopPos.push(p);
      const street = base.nearest(p);
      const q = base.point(street);
      const walkKm = Math.hypot(p.x - q.x, p.y - q.y);
      link(street, node, walkKm, walkMin(walkKm) + info.waitMin, true); // embarque: uma condução
      link(node, street, walkKm, walkMin(walkKm)); // desembarque
      if (j + 1 < line.stops.length) {
        const n = line.stops[j + 1];
        const km = Math.hypot(n.x - p.x, n.y - p.y) * (info.rail ? 1.1 : 1.05);
        link(node, node + 1, km, (km / info.speedKmh) * 60);
      }
    });
    id += line.stops.length;
  });

  return {
    ...base,
    mode: 'transit',
    lines,
    streetCount: N,
    stopLine,
    car: base,
    network: { adjacency, segments: base.network.segments },
    point: (i) => (i < N ? base.point(i) : stopPos[i - N]),
  };
}

export const isTransit = (c: CityMap): c is TransitCity => (c as TransitCity).mode === 'transit';

export type Leg =
  | { kind: 'walk'; minutes: number; nodes: number[] }
  | { kind: 'ride'; mode: TransitMode; ref: string; name: string; stops: number; minutes: number; waitMin: number; nodes: number[] };

/**
 * Trechos de uma viagem a partir dos nós do caminho (da origem ao destino) e do tempo restante até o
 * destino em cada posição do caminho (`along`, de `commute`).
 */
export function tripLegs(city: TransitCity, path: number[], along: number[]): Leg[] {
  const minutesTo = (i: number) => along[i];
  const legs: Leg[] = [];
  const N = city.streetCount;
  let i = 0;
  while (i < path.length - 1) {
    if (path[i + 1] >= N) {
      // Embarque: rua → parada; segue enquanto estiver na mesma linha.
      const li = city.stopLine[path[i + 1] - N];
      const line = city.lines[li];
      let j = i + 1;
      while (j + 1 < path.length && path[j + 1] >= N && city.stopLine[path[j + 1] - N] === li) j++;
      const waitMin = MODE_INFO[line.mode].waitMin;
      legs.push({
        kind: 'ride',
        mode: line.mode,
        ref: line.ref,
        name: line.name,
        stops: j - (i + 1),
        // Do embarque ao desembarque, sem a espera (mostrada à parte).
        minutes: minutesTo(i + 1) - minutesTo(j),
        waitMin,
        nodes: path.slice(i + 1, j + 1),
      });
      i = j;
    } else {
      let j = i;
      while (j + 1 < path.length && path[j + 1] < N) j++;
      if (j > i) legs.push({ kind: 'walk', minutes: minutesTo(i) - minutesTo(j), nodes: path.slice(i, j + 1) });
      if (j === i) i++; // desembarque: parada → rua
      else i = j;
    }
  }
  return legs.filter((l) => l.kind === 'ride' || l.minutes > 0.05);
}
