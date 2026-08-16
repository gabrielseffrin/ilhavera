/**
 * Quanto tempo a mesa ainda espera.
 *
 * O servidor manda o **instante** em que a paciência acaba, não o restante — ver
 * `PatchPayload.deadline`. Aqui se faz a subtração, uma vez por segundo, contra o
 * relógio deste navegador. É por isso que o erro não se acumula: cada tique
 * recalcula do zero em vez de decrementar um número que já podia estar errado.
 *
 * Não aparece quando a sala não tem relógio, que é o padrão.
 */

import { useEffect, useState } from 'react';
import { IconeDeSimbolo } from './icones/IconeDeSimbolo.js';
import { t } from '../i18n/pt-BR.js';

export type CronometroProps = {
  /** Epoch em ms, ou `null` sem relógio. */
  prazo: number | null;
  /** Fica em vermelho a partir daqui. */
  alerta?: number;
};

export function Cronometro({ prazo, alerta = 10 }: CronometroProps): React.JSX.Element | null {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (prazo === null) return;

    // Um intervalo só, recriado quando o prazo muda. Um `setTimeout` por
    // segundo acumularia atraso; este recalcula contra o relógio a cada vez.
    const id = setInterval(() => {
      setAgora(Date.now());
    }, 500);
    return () => {
      clearInterval(id);
    };
  }, [prazo]);

  if (prazo === null) return null;

  const restante = Math.max(0, Math.ceil((prazo - agora) / 1000));
  const apertado = restante <= alerta;

  return (
    <span
      data-testid="cronometro"
      data-restante={restante}
      /**
       * `role="timer"` com `aria-live="off"`: um contador que se anuncia a cada
       * segundo torna o leitor de tela inútil pelo resto do turno. Quem quiser
       * saber consulta; o aviso de que é a sua vez já vem pela faixa.
       */
      role="timer"
      aria-live="off"
      aria-label={t.cronometro.restante(restante)}
      className={`inline-flex items-center gap-1 rounded-controle px-2 py-1 text-sm tabular-nums ${
        apertado ? 'bg-perigo/80 text-perigo-texto' : 'bg-white/20 text-white'
      }`}
    >
      <IconeDeSimbolo simbolo="relogio" tamanho={13} />
      {restante}s
    </span>
  );
}
