/**
 * A coluna de informação: dados, mão, jogadores e histórico.
 *
 * Existe para a `App` continuar sendo só composição. Um painel lateral montado
 * dentro da `App` obriga a montar a aplicação inteira para testar a ordem de
 * dois cartões.
 *
 * A cadeia de `min-h-0` chega até aqui: sem ela o histórico não rola dentro da
 * própria caixa, ele estica a coluna e empurra o tabuleiro para fora da tela.
 */

import { useMemo } from 'react';

import type { ClientView, PlayerId } from '@ilhavera/rules';

import { Dados } from './Dados.js';
import { LogDeEventos } from './LogDeEventos.js';
import { PainelDaMao } from './PainelDaMao.js';
import { PainelDeAdversarios } from './PainelDeAdversarios.js';

export type PainelLateralProps = {
  mesa: ClientView;
  ativo: PlayerId | null;
};

export function PainelLateral({ mesa, ativo }: PainelLateralProps): React.JSX.Element {
  // Quantas rolagens já houve: é o gatilho da animação dos dados, e o único que
  // distingue duas rolagens de mesmo resultado uma da outra.
  const rolagens = useMemo(
    () => mesa.log.reduce((n, e) => (e.type === 'diceRolled' ? n + 1 : n), 0),
    [mesa.log],
  );

  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col gap-3 lg:w-96">
      <Dados roll={mesa.lastRoll} chave={rolagens} />
      <PainelDaMao voce={mesa.you} turno={mesa.turnNumber} />
      <PainelDeAdversarios mesa={mesa} ativo={ativo} />
      <LogDeEventos mesa={mesa} />
    </aside>
  );
}
