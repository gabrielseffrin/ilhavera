/**
 * O robô que joga pela interface.
 *
 * Ele não conhece as regras, não chama `reduce`, não consulta o estado para
 * decidir: lê o DOM e clica, como uma pessoa faria. É o mesmo robô nos dois
 * aceites — o da Fase 3, em hot-seat, e o da Fase 4, com quatro telas contra um
 * servidor de verdade. Ter um só importa: se o robô soubesse alguma coisa a mais
 * em rede, o aceite provaria o robô, não a interface.
 */

import { fireEvent } from '@testing-library/react';

/**
 * Aciona um alvo **pelo teclado**, quando ele for um alvo do tabuleiro.
 *
 * A divisão não é conveniência, é honestidade sobre o que dá para provar aqui.
 * Num `<button>` de verdade, quem transforma Enter em clique é o navegador, e o
 * jsdom não implementa isso — um teste que "provasse" essa parte estaria
 * provando o jsdom. Já nos alvos do tabuleiro, que são `<circle>` e `<polygon>`
 * com `role="button"`, quem transforma Enter em jogada é **código deste
 * repositório**, e é exatamente isso que precisa de teste.
 *
 * Devolve `true` quando acionou pelo teclado, para o teste poder exigir que isso
 * tenha acontecido um número honesto de vezes em vez de aceitar uma partida
 * inteira feita só de cliques em botão.
 */
export function acionar(alvo: Element, tecla: 'Enter' | ' ' = 'Enter'): boolean {
  const doTabuleiro = alvo.getAttribute('role') === 'button' && alvo.tagName !== 'BUTTON';

  if (!doTabuleiro) {
    fireEvent.click(alvo);
    return false;
  }

  (alvo as unknown as HTMLElement).focus?.();
  fireEvent.keyDown(alvo, { key: tecla });
  return true;
}

/**
 * O que clicar agora, em ordem de prioridade.
 *
 * Duas coisas nesta função foram descobertas fazendo, e não projetando:
 *
 * - **`n % total` em vez do primeiro de cada grupo.** Clicando sempre no
 *   primeiro destaque, as quinze estradas de um jogador saem empilhadas no
 *   mesmo canto do tabuleiro, nunca alcançam vértice novo, e a partida trava
 *   com todo mundo sem peça e com dois assentamentos. Espalhar a escolha é o
 *   que faz a mesa crescer;
 * - **no banco, trocar em direção à cidade.** Trocando 4:1 ao acaso, o minério
 *   nunca chega a três e ninguém evolui um assentamento. Uma pessoa troca com
 *   um objetivo; um robô que troca ao acaso não junta nada.
 *
 * A prioridade também põe comprar Carta de Progresso **abaixo** de construir:
 * a carta custa minério, e minério só sai da mão para carta ou para cidade.
 */
export function proximoClique(container: HTMLElement, n: number): Element | null {
  const um = (seletor: string, raiz: ParentNode = container): Element | null => {
    const todos = [...raiz.querySelectorAll(seletor)];
    return todos.length === 0 ? null : (todos[n % todos.length] as Element);
  };

  /**
   * Tudo procurado **dentro do contêiner**, e nunca no documento. No aceite da
   * Fase 4 há quatro telas no mesmo documento, e uma busca global faria o robô
   * clicar no modal do jogador ao lado — que, além de não ser o dele, contaria
   * a mão de outra pessoa.
   */
  const modal = container.querySelector('[data-testid="modal"]');
  if (modal !== null) {
    if (modal.getAttribute('data-modal') === 'tradeBank') {
      const botoes = [...modal.querySelectorAll('button[data-opcao]')];
      const rumo =
        botoes.find((b) => b.textContent?.includes('1× Minério')) ??
        botoes.find((b) => b.textContent?.includes('1× Trigo'));
      if (rumo !== undefined) return rumo;
    }

    return (
      um('button[data-opcao]', modal) ??
      // O descarte é montado à mão: o automático é a saída determinística.
      [...modal.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Descartar automático'),
      ) ??
      null
    );
  }

  const naBarra = (tipo: string): Element | null =>
    container.querySelector(`[data-testid="barra-de-acoes"] [data-acao="${tipo}"]`);

  return (
    naBarra('rollDice') ??
    um('[data-hex-legal] polygon:last-of-type') ??
    naBarra('playKnight') ??
    naBarra('playRoadBuilding') ??
    naBarra('playYearOfPlenty') ??
    naBarra('playMonopoly') ??
    um('[data-vertice-legal][data-acao="buildCity"] circle:last-of-type') ??
    um('[data-vertice-legal] circle:last-of-type') ??
    um('[data-aresta-legal] line:last-of-type') ??
    naBarra('tradeBank') ??
    naBarra('buyDevCard') ??
    naBarra('endTurn')
  );
}
