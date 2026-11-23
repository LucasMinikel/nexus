import { LIMITS } from '../../lib/matching/api';
import { cloudAvailable, cloudHost, type CloudState, type Target } from './useExecution';
import { Heading } from './heading';

interface Props {
  target: Target;
  onTarget: (t: Target) => void;
  localMs: number;
  cloud: CloudState;
  fresh: boolean;
  identical: boolean | null;
  mounted: boolean;
}

const kb = (n: number) => `${(n / 1024).toFixed(1).replace('.', ',')} KB`;
const ms = (n: number) => (n < 0.05 ? '<0,1 ms' : `${n.toFixed(n < 10 ? 1 : 0).replace('.', ',')} ms`);

/** Mostra onde o cálculo roda, quanto custa e o que trafega pela rede. */
export default function ExecutionPanel({ target, onTarget, localMs, cloud, fresh, identical, mounted }: Props) {
  return (
    <section className="card vm-exec">
      <div className="vm-exec-head">
        <Heading id="vm-exec-title">Onde calcular as alocações?</Heading>
        <div className="vm-exec-choice" role="radiogroup" aria-labelledby="vm-exec-title">
          <button role="radio" aria-checked={target === 'browser'} className={target === 'browser' ? 'on' : ''} onClick={() => onTarget('browser')}>
            Seu navegador
          </button>
          <button
            role="radio"
            aria-checked={target === 'cloud'}
            className={target === 'cloud' ? 'on' : ''}
            onClick={() => onTarget('cloud')}
            disabled={!cloudAvailable}
            title={cloudAvailable ? undefined : 'Serviço ainda não publicado'}
          >
            Google Cloud Run
          </button>
        </div>
      </div>

      {target === 'browser' && (
        <div className="vm-exec-body">
          <p>
            <strong>Rodando no seu computador.</strong> O código dos algoritmos veio junto com a página, pelo CDN, e executa no
            seu processador. Nada é enviado a nenhum servidor.
          </p>
          <dl className="vm-exec-stats">
            <div><dt>Tempo de cálculo</dt><dd>{mounted ? ms(localMs) : '—'}</dd></div>
            <div><dt>Enviado a servidores</dt><dd>0 bytes</dd></div>
            <div><dt>Custo para o NEXUS</dt><dd>R$ 0</dd></div>
          </dl>
          {!cloudAvailable && (
            <p className="muted small">
              A opção Google Cloud Run aparece quando o serviço <code>services/matching</code> estiver publicado.
            </p>
          )}
        </div>
      )}

      {target === 'cloud' && (
        <div className="vm-exec-body">
          <p>
            <strong>Rodando no Google Cloud.</strong> Seu navegador envia o cenário para <code>{cloudHost}</code>, o servidor
            calcula as alocações dos três algoritmos e devolve o resultado para ser desenhado aqui.
          </p>
          <p className="vm-exec-status">
            {cloud.status === 'waiting' && 'Enviando…'}
            {cloud.status === 'slow' &&
              'Ligando o servidor… Sem visitas ele fica desligado e não custa nada; a primeira requisição espera ele iniciar (partida a frio).'}
            {cloud.status === 'ok' && !fresh && 'Atualizando com o cenário novo…'}
            {cloud.status === 'error' && <span className="vm-exec-error">Erro: {cloud.error}. Mostrando o cálculo do navegador.</span>}
          </p>
          {cloud.status === 'ok' && (
            <dl className="vm-exec-stats">
              <div><dt>Ida e volta</dt><dd>{ms(cloud.rttMs)}</dd></div>
              <div><dt>Cálculo no servidor</dt><dd>{ms(cloud.response.server.processingMs)}</dd></div>
              <div><dt>Rede e fila</dt><dd>{ms(Math.max(0, cloud.rttMs - cloud.response.server.processingMs))}</dd></div>
              <div><dt>Enviado</dt><dd>{kb(cloud.sentBytes)}</dd></div>
              <div><dt>Recebido</dt><dd>{kb(cloud.receivedBytes)}</dd></div>
              <div><dt>Região</dt><dd>{cloud.response.server.region}</dd></div>
              <div>
                <dt>Instância</dt>
                <dd>
                  {cloud.response.server.coldStart
                    ? 'acabou de ligar (fria)'
                    : `já ligada, ${cloud.response.server.instanceRequests} cálculos`}
                </dd>
              </div>
              <div>
                <dt>Comparado ao navegador</dt>
                <dd className={identical ? 'ok' : identical === false ? 'bad' : ''}>
                  {identical === null ? '—' : identical ? 'resultado idêntico ✓' : 'resultado diferente ✗'}
                </dd>
              </div>
            </dl>
          )}
          <details className="small">
            <summary>O que o servidor aceita e por que ele não pode ser usado para outra coisa</summary>
            <ul>
              <li>Uma única rota, <code>POST /match</code>, que só faz este cálculo. Não há rota para áudio, arquivos ou texto livre.</li>
              <li>Só JSON (outros formatos recebem 415), até {kb(LIMITS.maxBodyBytes)}, validado campo a campo; campos desconhecidos são descartados.</li>
              <li>No máximo {LIMITS.maxVacancies} vagas, {LIMITS.maxCandidates} candidatos e {LIMITS.maxSlots} postos por vaga.</li>
              <li>{LIMITS.requestsPerMinute} cálculos por minuto por IP e número máximo de instâncias limitado: o custo tem teto.</li>
              <li>CORS libera apenas as origens do NEXUS, então outros sites não conseguem chamá-lo pelo navegador dos visitantes deles.</li>
              <li>
                Limitação honesta: a verificação de origem não impede scripts fora do navegador (como <code>curl</code>), que podem
                forjar o cabeçalho. Contra isso valem os limites acima e o alerta de orçamento.
              </li>
            </ul>
          </details>
          <p className="muted small">
            O ranking e as explicações abaixo continuam calculados no navegador, que também refaz as alocações só para conferir o
            resultado. Custo: o Cloud Run fica com zero instâncias sem uso, então só há cobrança enquanto calcula; a cota gratuita
            mensal costuma cobrir o tráfego de um portfólio.
          </p>
        </div>
      )}
    </section>
  );
}
