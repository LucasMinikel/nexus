import { useMemo, useRef, useState } from 'react';
import { RULE, stabilityTrial, summarize, type StabilityTrial } from '../../lib/lab/stability';
import LabTest, { Stat, useBatchRunner, useAutoStart, usePlotSize } from './LabTest';

const RUNS = 200;
const X_MAX = 25; // % de perda de score
const PAD = 34;

const pct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;

export default function StabilityTest() {
  const plot = usePlotSize(520, 0.5);
  const { W, H } = plot;
  const [vacancies, setVacancies] = useState(12);
  const [candidates, setCandidates] = useState(40);
  const [trials, setTrials] = useState<StabilityTrial[]>([]);
  const [running, setRunning] = useState(false);
  const [hover, setHover] = useState<StabilityTrial | null>(null);
  const buffer = useRef<StabilityTrial[]>([]);

  const runner = useBatchRunner(
    (i) => {
      buffer.current.push(stabilityTrial(i + 1, vacancies, candidates));
      // Atualiza a tela a cada 5 cenários: suficiente para ver o gráfico crescer.
      if (buffer.current.length % 5 === 0) setTrials([...buffer.current]);
    },
    () => {
      setTrials([...buffer.current]);
      setRunning(false);
    },
  );

  const run = () => {
    buffer.current = [];
    setTrials([]);
    setRunning(true);
    runner.start(0, RUNS);
  };
  const stop = () => {
    runner.stop();
    setTrials([...buffer.current]);
    setRunning(false);
  };
  useAutoStart(() => run());

  const s = useMemo(() => summarize(trials), [trials]);
  const yMax = Math.max(6, ...trials.map((t) => t.hungarianBlocking));
  const x = (v: number) => PAD + (Math.min(v, X_MAX) / X_MAX) * (W - PAD - 10);
  const y = (v: number) => H - PAD - (v / yMax) * (H - PAD - 12);

  return (
    <LabTest
      id="estabilidade"
      index={1}
      hypothesis="Maximizar o score total deixa a alocação instável — e corrigir isso custa pouco."
      verdict={s.verdict}
      rule={`confirmada se o Hungarian deixar pares bloqueantes em ≥ ${RULE.unstablePct}% dos cenários e o Gale–Shapley perder ≤ ${RULE.maxMeanLossPct}% de score em média`}
      source="src/lib/lab/stability.ts"
    >
      <div className="lt-body">
        <figure className="lt-plot" ref={plot.ref}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cada ponto é um cenário: perda de score do Gale–Shapley no eixo horizontal, pares bloqueantes do Hungarian no vertical">
            {[0, 5, 10, 15, 20, 25].map((v) => (
              <g key={v}>
                <line x1={x(v)} x2={x(v)} y1={12} y2={H - PAD} className="lt-grid" />
                <text x={x(v)} y={H - PAD + 16} className="lt-tick" textAnchor="middle">{v}%</text>
              </g>
            ))}
            {Array.from({ length: yMax + 1 }, (_, v) => (
              <text key={v} x={PAD - 8} y={y(v) + 4} className="lt-tick" textAnchor="end">{v}</text>
            ))}
            <line x1={PAD} x2={W - 10} y1={y(0)} y2={y(0)} className="lt-zero" />
            <text x={W - 12} y={y(0) - 6} className="lt-note" textAnchor="end">Gale–Shapley: sempre 0</text>
            <rect x={PAD} y={12} width={x(RULE.maxMeanLossPct) - PAD} height={H - PAD - 12} className="lt-zone" />
            {trials.map((t) => (
              <circle
                key={t.seed}
                cx={x(t.scoreLossPct)}
                // Desloca levemente para cima, para pontos iguais não se esconderem (sem cruzar o eixo).
                cy={y(t.hungarianBlocking) - ((t.seed * 7) % 8)}
                r={hover?.seed === t.seed ? 6 : 3.5}
                className={t.hungarianBlocking > 0 ? 'lt-dot bad' : 'lt-dot'}
                onPointerEnter={() => setHover(t)}
                onPointerLeave={() => setHover(null)}
              />
            ))}
          </svg>
          <figcaption>
            {hover
              ? `cenário ${hover.seed}: Hungarian com ${hover.hungarianBlocking} pares bloqueantes; o estável perde ${pct(hover.scoreLossPct)} do score`
              : 'cada ponto é um cenário ↔ perda de score do estável · ↕ pares bloqueantes do ótimo'}
          </figcaption>
        </figure>

        <div className="lt-side">
          <div className="lt-stats">
            <Stat label="dos cenários com o ótimo instável" value={pct(s.unstablePct)} hot={s.unstablePct >= RULE.unstablePct} />
            <Stat label="de score perdido para ficar estável" value={pct(s.meanLossPct)} />
            <Stat label="cenários" value={`${s.trials}/${RUNS}`} />
          </div>
          <div className="lt-controls">
            <label>
              <span>vagas <output>{vacancies}</output></span>
              <input type="range" min={4} max={20} value={vacancies} disabled={running} onChange={(e) => setVacancies(Number(e.target.value))} />
            </label>
            <label>
              <span>candidatos <output>{candidates}</output></span>
              <input type="range" min={10} max={80} step={5} value={candidates} disabled={running} onChange={(e) => setCandidates(Number(e.target.value))} />
            </label>
            {running ? (
              <button className="button quiet" onClick={stop}>parar</button>
            ) : (
              <button className="button" onClick={run}>rodar {RUNS} cenários</button>
            )}
          </div>
        </div>
      </div>
    </LabTest>
  );
}
