/**
 * A recusa que o jogador precisa ler.
 *
 * `role="alert"` é o contrato que o aceite das Fases 3 e 4 vigia: o robô joga a
 * partida inteira e o teste falha se **qualquer** clique oferecido produzir um
 * alerta. Ter isso numa primitiva em vez de escrito à mão em quatro arquivos é o
 * que garante que uma tela nova não invente um erro silencioso.
 *
 * A variante `compacto` existe porque o chat já divergia por conta própria
 * (`px-2 py-1 text-xs` contra `px-3 py-2 text-sm`) — o painel dele é estreito e
 * o alerta ali disputa espaço com a conversa. Divergência decidida vira
 * variante; divergência esquecida vira bug de aparência.
 */

import type { ReactNode } from 'react';

export type AlertaProps = {
  children: ReactNode;
  /** Para painéis estreitos, como o do chat. */
  compacto?: boolean;
};

const BASE = 'rounded-controle bg-perigo/80 text-perigo-texto';

export function Alerta({ children, compacto = false }: AlertaProps): React.JSX.Element {
  const densidade = compacto ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm';

  return (
    <p role="alert" className={`${BASE} ${densidade}`}>
      {children}
    </p>
  );
}
