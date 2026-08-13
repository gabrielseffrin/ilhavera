/**
 * O aceite da Fase 3: **partida completa jogável em hot-seat no navegador.**
 *
 * Um robô joga do setup à vitória tocando só no que a interface desenhou —
 * alvos destacados no tabuleiro, botões da barra, opções dos modais. Ele não
 * conhece as regras, não chama `reduce`, não consulta o estado para decidir: lê
 * o DOM e clica, como uma pessoa faria.
 *
 * A asserção que carrega a fase inteira roda depois de cada clique: **nenhum
 * `role="alert"` pode aparecer.** Se aparecer, a interface ofereceu uma jogada
 * que o motor recusou — e a tese da fase, de que o destaque sai do mesmo
 * `enumerateLegalActions` que valida, estaria quebrada. É o análogo web do
 * `full-game.test.ts` do servidor e do `make demo` da CLI.
 *
 * Duas sementes, e não uma: com uma só, "a partida termina" pode ser sorte de
 * tabuleiro. Elas custam uns cinco segundos cada.
 *
 * `fireEvent` e não `userEvent` de propósito: são milhares de cliques, e a
 * simulação completa de ponteiro do `userEvent` transformaria o aceite num
 * teste que ninguém roda.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../src/App.js';
import { usePartida } from '../src/estado/partida.js';

/** Teto de segurança. As sementes abaixo terminam em torno de mil. */
const MAXIMO_DE_CLIQUES = 4000;

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
function proximoClique(container: HTMLElement, n: number): Element | null {
  const doc = container.ownerDocument;

  const um = (seletor: string, raiz: ParentNode = container): Element | null => {
    const todos = [...raiz.querySelectorAll(seletor)];
    return todos.length === 0 ? null : (todos[n % todos.length] as Element);
  };

  const modal = doc.querySelector('[data-testid="modal"]');
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

describe('aceite da Fase 3: partida completa em hot-seat', () => {
  for (const semente of ['aceite-1', 'aceite-3']) {
    it(`vai do setup ao vencedor sem uma jogada recusada (semente ${semente})`, () => {
      act(() => {
        usePartida.getState().reiniciar(semente);
      });
      const { container, unmount } = render(<App />);

      let cliques = 0;
      while (usePartida.getState().mesa.winner === null && cliques < MAXIMO_DE_CLIQUES) {
        const alvo = proximoClique(container, cliques);
        if (alvo === null) {
          throw new Error(
            `interface travada na fase ${usePartida.getState().mesa.phase} ` +
              `após ${cliques} cliques: nada para clicar e a partida não acabou`,
          );
        }

        act(() => {
          fireEvent.click(alvo);
        });
        cliques++;

        // A tese da fase, verificada a cada clique.
        if (screen.queryByRole('alert') !== null) {
          throw new Error(
            `clique ${cliques} recusado na fase ${usePartida.getState().mesa.phase}: ` +
              `${screen.getByRole('alert').textContent}`,
          );
        }
      }

      const mesa = usePartida.getState().mesa;
      expect(mesa.winner, `partida não terminou em ${cliques} cliques`).not.toBeNull();
      expect(mesa.phase).toBe('finished');

      // O fim precisa ser visível: sem isso a mesa só para de aceitar jogadas e
      // ninguém entende por quê.
      const faixa = screen.getByTestId('fim-de-partida');
      expect(faixa).toHaveAttribute('data-vencedor', mesa.winner as string);
      expect(faixa).toHaveTextContent('venceu com');

      // Fim de partida não pede jogada de ninguém.
      expect(screen.queryByTestId('vez-de')).not.toBeInTheDocument();
      expect(screen.queryByTestId('barra-de-acoes')).not.toBeInTheDocument();

      // E a partida precisa ter sido funda. Sem isto o aceite passa por sorte:
      // uma mesa que só rola dado e passa a vez também "termina".
      const tipos = new Set(mesa.log.map((e) => e.type));
      for (const tipo of [
        'settlementPlaced',
        'roadPlaced',
        'cityBuilt',
        'diceRolled',
        'resourcesProduced',
        'discarded',
        'robberMoved',
        'stolen',
        'devCardBought',
        'devCardPlayed',
        'bankTraded',
        'turnEnded',
        'gameWon',
      ] as const) {
        expect([...tipos], `a partida nunca produziu ${tipo}`).toContain(tipo);
      }

      unmount();
    });
  }
});
