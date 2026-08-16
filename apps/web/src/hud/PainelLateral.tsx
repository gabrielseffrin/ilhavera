/**
 * A coluna de informação: dados, mão, jogadores e histórico.
 *
 * Existe para a `App` continuar sendo só composição. Um painel lateral montado
 * dentro da `App` obriga a montar a aplicação inteira para testar a ordem de
 * dois cartões.
 *
 * A cadeia de `min-h-0` chega até aqui: sem ela o histórico não rola dentro da
 * própria caixa, ele estica a coluna e empurra o tabuleiro para fora da tela.
 *
 * ## Sobre o tamanho, e por que ele fala de orientação
 *
 * Até a Fase 4 a coluna virava lateral em `lg:` — 1024px de **largura**. O eixo
 * estava errado: um celular deitado tem 844px e é exatamente onde a lateral faz
 * mais falta, porque empilhar numa tela de 390px de altura deixa o tabuleiro com
 * uma faixa. O que decide se cabe lado a lado é a orientação, não quantos pixels
 * o aparelho tem.
 *
 * Em retrato a coluna é recolhível: numa tela alta e estreita o tabuleiro quer a
 * tela inteira, e a informação vem quando pedida.
 */

import { useMemo } from 'react';

import type { ClientView, PlayerId } from '@ilhavera/rules';

import { temChat, useCliente } from '../estado/contexto.js';

import { Chat } from './Chat.js';
import { Dados } from './Dados.js';
import { LogDeEventos } from './LogDeEventos.js';
import { PainelDaMao } from './PainelDaMao.js';
import { PainelDeAdversarios } from './PainelDeAdversarios.js';

export type PainelLateralProps = {
  mesa: ClientView;
  ativo: PlayerId | null;
  /**
   * Vale **só em retrato**. Em paisagem a coluna está ao lado do tabuleiro e não
   * disputa espaço com ele, então recolhê-la só esconderia informação de graça.
   */
  aberto?: boolean;
  /**
   * O que entra no topo da coluna. Hoje é a proposta em curso, e ela vem por
   * aqui em vez de ser montada dentro: a negociação precisa de `legais` e de
   * despachar jogada, e arrastar as duas coisas para dentro do painel faria
   * dele mais um lugar que conhece a lista de legais.
   */
  children?: React.ReactNode;
};

export const ID_DO_PAINEL_LATERAL = 'painel-lateral';

export function PainelLateral({
  mesa,
  ativo,
  aberto = true,
  children,
}: PainelLateralProps): React.JSX.Element {
  const cliente = useCliente();

  // Quantas rolagens já houve: é o gatilho da animação dos dados, e o único que
  // distingue duas rolagens de mesmo resultado uma da outra.
  const rolagens = useMemo(
    () => mesa.log.reduce((n, e) => (e.type === 'diceRolled' ? n + 1 : n), 0),
    [mesa.log],
  );

  return (
    <aside
      id={ID_DO_PAINEL_LATERAL}
      data-testid="painel-lateral"
      data-aberto={aberto}
      className={[
        // `overflow-y-auto` aqui, e não só no histórico: num celular deitado a
        // coluna inteira não cabe em 390px de altura, e sem isto o que sobra
        // some para fora da tela em vez de rolar.
        'flex min-h-0 w-full shrink-0 flex-col gap-3 overflow-y-auto',
        // Em paisagem vira lateral. A largura acompanha: 24rem numa tela de
        // 844px seria quase metade dela só de painel.
        'landscape:w-80 xl:landscape:w-96',
        // Em retrato o tabuleiro tem prioridade — a coluna nunca passa de 45%
        // da altura, e some quando recolhida.
        aberto ? 'portrait:max-h-[45%]' : 'portrait:hidden',
      ].join(' ')}
    >
      {children}
      <Dados roll={mesa.lastRoll} chave={rolagens} />
      <PainelDaMao voce={mesa.you} turno={mesa.turnNumber} />
      <PainelDeAdversarios mesa={mesa} ativo={ativo} />
      <LogDeEventos mesa={mesa} />
      {/* Depois do histórico, e não antes: o log é o que se consulta o tempo
          todo; a conversa é o que se procura quando se quer falar. */}
      {temChat(cliente) && <Chat euId={mesa.you?.id ?? null} className="max-h-64" />}
    </aside>
  );
}
