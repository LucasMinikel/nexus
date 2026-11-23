import { useMemo, useState } from 'react';
import { addGlare, blur, exposureShift, place, rotate90, type CheckId, type Img, type Quad } from 'doc-check/core';
import { DEFAULT_POLICY, DocumentCheck, type Enforcement, type Policy } from 'doc-check/react';
import { cardRect, drawCard } from 'doc-check/specimen';
import './DocCheckDemo.css';

/**
 * Foto de documento conferida antes do envio. O componente vem do projeto doc-check; aqui ficam
 * só os controles da demonstração: degradar um documento fictício e escolher a regra de cada verificação.
 */

const W = 1400;
const H = 900;

/** Onde o cartão aparece na foto simulada (frações), para cada opção de enquadramento. */
const FRAMES: Record<string, Quad | null> = {
  frente: null,
  inclinado: [
    { x: 0.14, y: 0.12 },
    { x: 0.88, y: 0.2 },
    { x: 0.84, y: 0.86 },
    { x: 0.1, y: 0.8 },
  ],
  cortado: [
    { x: 0.32, y: 0.16 },
    { x: 1.12, y: 0.16 },
    { x: 1.12, y: 0.84 },
    { x: 0.32, y: 0.84 },
  ],
  longe: [
    { x: 0.36, y: 0.38 },
    { x: 0.66, y: 0.38 },
    { x: 0.66, y: 0.67 },
    { x: 0.36, y: 0.67 },
  ],
};

const CONTROLS = {
  frame: { label: 'Enquadramento', options: [['de frente', 'frente'], ['inclinado', 'inclinado'], ['cortado', 'cortado'], ['longe', 'longe']] },
  focus: { label: 'Foco', options: [['nítido', 0], ['leve', 2], ['borrado', 4], ['muito borrado', 8]] },
  light: { label: 'Luz', options: [['normal', 1], ['pouca', 0.6], ['escuro', 0.3]] },
  glare: { label: 'Reflexo', options: [['nenhum', 0], ['pequeno', 1], ['grande', 2]] },
  turn: { label: 'Posição', options: [['em pé', 0], ['deitado 90°', 1]] },
} as const;
type Key = keyof typeof CONTROLS;
type State = { [K in Key]: (typeof CONTROLS)[K]['options'][number][1] };

function degrade(base: Img, s: State): Img {
  let img = base;
  if (s.glare === 1) img = addGlare(img, 0.55, 0.62, 0.05);
  if (s.glare === 2) img = addGlare(img, 0.7, 0.32, 0.13);
  if (s.light !== 1) img = exposureShift(img, s.light);
  if (s.focus) img = blur(img, s.focus);
  const to = FRAMES[s.frame];
  if (to) img = place(img, cardRect(W, H), to, W, H, Math.round(60 * s.light));
  if (s.turn) img = rotate90(img);
  return img;
}

const INITIAL: State = { frame: 'frente', focus: 0, light: 1, glare: 0, turn: 0 };

const CHECK_LABELS: Record<CheckId, string> = {
  framing: 'Enquadramento',
  resolution: 'Resolução',
  sharpness: 'Nitidez',
  exposure: 'Iluminação',
  glare: 'Reflexo',
  orientation: 'Orientação',
};
const RULES: [Enforcement, string][] = [
  ['warn', 'avisa'],
  ['block', 'bloqueia'],
  ['off', 'desligado'],
];

export default function DocCheckDemo() {
  const base = useMemo(() => drawCard(W, H), []);
  const [state, setState] = useState<State>(INITIAL);
  const [policy, setPolicy] = useState<Policy>({});
  const [log, setLog] = useState<string | null>(null);
  const sample = useMemo(() => degrade(base, state), [base, state]);

  const custom = Object.entries(policy).filter(([id, rule]) => rule !== DEFAULT_POLICY[id as CheckId]);
  const snippet = custom.length
    ? `<DocumentCheck\n  policy={{ ${custom.map(([id, rule]) => `${id}: '${rule}'`).join(', ')} }}\n  onSubmit={enviar}\n/>`
    : '<DocumentCheck onSubmit={enviar} />  // tudo como aviso';

  return (
    <div className="dcd">
      <ol className="dcd-steps">
        <li>
          <strong>Estrague a foto</strong>
          <span>Use os botões para borrar, escurecer, inclinar ou cortar o documento fictício. Ou use a sua câmera ou uma foto.</span>
        </li>
        <li>
          <strong>Veja o que ele diz</strong>
          <span>Cada verificação mostra o valor medido, a meta e o que fazer para corrigir. O documento é achado e endireitado.</span>
        </li>
        <li>
          <strong>Escolha o que bloqueia</strong>
          <span>Cada problema pode só avisar ou impedir o envio. O código para usar no seu sistema aparece embaixo.</span>
        </li>
      </ol>

      <fieldset className="dcd-controls card">
        <legend>Simular problemas no documento fictício</legend>
        {(Object.keys(CONTROLS) as Key[]).map((key) => (
          <div key={key} className="dcd-group" role="radiogroup" aria-label={CONTROLS[key].label}>
            <span className="dcd-label">{CONTROLS[key].label}</span>
            {CONTROLS[key].options.map(([label, value]) => (
              <label key={label} className={state[key] === value ? 'on' : ''}>
                <input type="radio" name={key} checked={state[key] === value} onChange={() => setState((s) => ({ ...s, [key]: value }))} />
                {label}
              </label>
            ))}
          </div>
        ))}
        <button type="button" className="dcd-reset" onClick={() => setState({ ...INITIAL })}>
          Restaurar
        </button>
      </fieldset>

      <DocumentCheck
        sample={sample}
        policy={policy}
        onSubmit={(blob, r, v) =>
          setLog(
            `Enviaria ${Math.round(blob.size / 1024)} KB${r.document.quad ? ' (documento recortado e endireitado)' : ''}, ` +
              `${v.problems.length} problema(s) e ${v.warnings.length} aviso(s) junto. Simulado: nada saiu do aparelho.`,
          )
        }
      />
      {log && (
        <p className="dcd-log" role="status">
          {log}
        </p>
      )}

      <fieldset className="dcd-controls dcd-policy card">
        <legend>Regra de envio · o que cada problema faz</legend>
        {(Object.keys(CHECK_LABELS) as CheckId[]).map((id) => (
          <div key={id} className="dcd-group" role="radiogroup" aria-label={`${CHECK_LABELS[id]}: regra`}>
            <span className="dcd-label">{CHECK_LABELS[id]}</span>
            {RULES.map(([rule, label]) => {
              const on = (policy[id] ?? DEFAULT_POLICY[id]) === rule;
              return (
                <label key={rule} className={`${on ? 'on' : ''} ${rule}`}>
                  <input type="radio" name={`policy-${id}`} checked={on} onChange={() => setPolicy((p) => ({ ...p, [id]: rule }))} />
                  {label}
                </label>
              );
            })}
          </div>
        ))}
        <pre className="dcd-snippet" aria-label="Código equivalente">{snippet}</pre>
      </fieldset>
    </div>
  );
}
