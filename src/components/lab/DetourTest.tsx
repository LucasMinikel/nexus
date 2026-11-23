import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { BRIDGE_ROWS, CITY_KM, RIVER_X, nodeId, nodePoint, type Point } from '../../lib/city/city';
import { RULE, randomTrip, summarizeTrips, trip, type Trip } from '../../lib/lab/detour';
import { network } from '../../lib/matching/api';
import { rng } from '../../lib/random';
import LabTest, { Stat, useBatchRunner, useAutoStart, usePlotSize } from './LabTest';

const RUNS = 300;
const PAD = 34;
const KM_MAX = 13;
const MIN_MAX = 60;

const fmt = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

export default function DetourTest() {
  const plot = usePlotSize(420, 0.72);
  const { W, H } = plot;
  const [trips, setTrips] = useState<Trip[]>([]);
  const [running, setRunning] = useState(false);
  const [picked, setPicked] = useState<Trip | null>(null);
  const [origin, setOrigin] = useState<Point | null>(null);
  const [seed, setSeed] = useState(1);
  const buffer = useRef<Trip[]>([]);
  const r = useRef(rng(1));

  const runner = useBatchRunner(
    () => {
      buffer.current.push(randomTrip(network, r.current));
      if (buffer.current.length % 10 === 0) setTrips([...buffer.current]);
    },
    () => {
      const all = [...buffer.current];
      setTrips(all);
      setRunning(false);
      // Abre o mapa no maior desvio: entre viagens de mais de 2 km, a que mais anda pela rua para cada km de linha reta.
      const detour = (t: Trip) => (t.straightKm > 2 ? t.networkKm / t.straightKm : 0);
      setPicked((p) => p ?? all.reduce((a, b) => (detour(b) > detour(a) ? b : a)));
    },
  );
  const run = (s = seed) => {
    r.current = rng(s);
    buffer.current = [];
    setTrips([]);
    setPicked(null);
    setRunning(true);
    runner.start(0, RUNS);
  };
  useAutoStart(() => run());

  const s = useMemo(() => summarizeTrips(trips), [trips]);
  const estimate = (t: Trip) => s.slope * t.straightKm + s.intercept;
  const errorOf = (t: Trip) => (estimate(t) - t.minutes) / t.minutes;
  const isBad = (t: Trip) => trips.length >= 2 && Math.abs(errorOf(t)) > RULE.maxError;

  // Mapa: clique escolhe origem e depois destino.
  const onMap = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const p = { x: ((e.clientX - box.left) / box.width) * CITY_KM, y: ((e.clientY - box.top) / box.height) * CITY_KM };
    if (!origin) {
      setOrigin(p);
      setPicked(null);
    } else {
      setPicked(trip(network, origin, p));
      setOrigin(null);
    }
  };

  const sx = (km: number) => PAD + (Math.min(km, KM_MAX) / KM_MAX) * (W - PAD - 10);
  const sy = (min: number) => H - PAD - (Math.min(min, MIN_MAX) / MIN_MAX) * (H - PAD - 12);
  const route = picked?.path.map((n) => nodePoint(n)) ?? [];

  return (
    <LabTest
      id="linha-reta"
      index={2}
      hypothesis="A distância em linha reta basta para estimar o tempo de deslocamento."
      verdict={s.verdict}
      rule={`confirmada se a melhor reta minutos × km errar mais de ${RULE.maxError * 100}% em no máximo ${RULE.maxBadPct}% das viagens`}
      source="src/lib/lab/detour.ts"
    >
      <div className="lt-body detour">
        <figure className="lt-map">
          <svg viewBox={`-0.3 -0.3 ${CITY_KM + 0.6} ${CITY_KM + 0.6}`} onClick={onMap} role="img" aria-label="Mapa da cidade: clique na origem e depois no destino">
            {network.segments.map((seg, i) => {
              const a = nodePoint(seg.a);
              const b = nodePoint(seg.b);
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={seg.avenue ? 'lt-avenue' : 'lt-street'} />;
            })}
            <rect x={RIVER_X - 0.12} y={-0.3} width={0.24} height={CITY_KM + 0.6} className="lt-river" />
            {BRIDGE_ROWS.map((row) => (
              <rect key={row} x={RIVER_X - 0.2} y={nodePoint(nodeId(0, row)).y - 0.07} width={0.4} height={0.14} className="lt-bridge" />
            ))}
            {picked && (
              <>
                <line x1={picked.from.x} y1={picked.from.y} x2={picked.to.x} y2={picked.to.y} className="lt-straight" />
                <polyline points={[picked.from, ...route, picked.to].map((p) => `${p.x},${p.y}`).join(' ')} className="lt-route" />
                <circle cx={picked.to.x} cy={picked.to.y} r={0.22} className="lt-pin to" />
                <circle cx={picked.from.x} cy={picked.from.y} r={0.22} className="lt-pin" />
              </>
            )}
            {origin && <circle cx={origin.x} cy={origin.y} r={0.25} className="lt-pin pulse" />}
          </svg>
          <figcaption aria-live="polite">
            {origin
              ? 'agora clique no destino'
              : picked
                ? `linha reta ${fmt(picked.straightKm)} km · pela rua ${fmt(picked.networkKm)} km · ${fmt(picked.minutes, 0)} min · a reta estimaria ${fmt(estimate(picked), 0)} min (${errorOf(picked) > 0 ? '+' : ''}${fmt(errorOf(picked) * 100, 0)}%)`
                : 'clique em dois pontos do mapa, ou num ponto do gráfico'}
          </figcaption>
        </figure>

        <div className="lt-side">
          <figure className="lt-plot" ref={plot.ref}>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cada ponto é uma viagem: km em linha reta no eixo horizontal, minutos no vertical">
              {[0, 4, 8, 12].map((v) => (
                <g key={v}>
                  <line x1={sx(v)} x2={sx(v)} y1={12} y2={H - PAD} className="lt-grid" />
                  <text x={sx(v)} y={H - PAD + 16} className="lt-tick" textAnchor="middle">{v} km</text>
                </g>
              ))}
              {[0, 20, 40, 60].map((v) => (
                <text key={v} x={PAD - 6} y={sy(v) + 4} className="lt-tick" textAnchor="end">{v}</text>
              ))}
              {trips.length >= 2 && <line x1={sx(0)} y1={sy(s.intercept)} x2={sx(KM_MAX)} y2={sy(s.slope * KM_MAX + s.intercept)} className="lt-fit" />}
              {trips.map((t, i) => (
                <circle
                  key={i}
                  cx={sx(t.straightKm)}
                  cy={sy(t.minutes)}
                  r={picked === t ? 6 : 3}
                  className={`lt-dot ${isBad(t) ? 'bad' : ''} ${t.crossesRiver ? 'cross' : ''}`}
                  onClick={() => setPicked(t)}
                />
              ))}
            </svg>
            <figcaption>linha tracejada: a melhor estimativa pela reta · vermelho: erro acima de {RULE.maxError * 100}%</figcaption>
          </figure>
          <div className="lt-stats">
            <Stat label={`das viagens com erro > ${RULE.maxError * 100}%`} value={`${fmt(s.badPct)}%`} hot={s.badPct > RULE.maxBadPct} />
            <Stat label="correlação km × minutos" value={fmt(s.r, 2)} />
            <Stat label="viagens" value={`${s.trips}/${RUNS}`} />
          </div>
          <div className="lt-controls">
            <button
              className="button"
              disabled={running}
              onClick={() => {
                setSeed(seed + 1);
                run(seed + 1);
              }}
            >
              sortear {RUNS} novas viagens
            </button>
            {/* Porta de teclado para o mapa: percorre as viagens em que a reta mais erra. */}
            <button
              className="button quiet"
              disabled={running || trips.length < 2}
              onClick={() => {
                const worst = [...trips].sort((a, b) => Math.abs(errorOf(b)) - Math.abs(errorOf(a))).slice(0, 10);
                const i = picked ? worst.indexOf(picked) : -1;
                setPicked(worst[(i + 1) % worst.length]);
              }}
            >
              próximo maior erro
            </button>
          </div>
        </div>
      </div>
    </LabTest>
  );
}
