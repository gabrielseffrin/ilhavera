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

import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { montarHotSeat } from './helpers/hotseat.js';
import { proximoClique } from './helpers/robo.js';

/** Teto de segurança. As sementes abaixo terminam em torno de mil. */
const MAXIMO_DE_CLIQUES = 4000;

describe('aceite da Fase 3: partida completa em hot-seat', () => {
  for (const semente of ['aceite-1', 'aceite-3']) {
    it(`vai do setup ao vencedor sem uma jogada recusada (semente ${semente})`, () => {
      const { container, unmount, partida } = montarHotSeat(semente);

      /** A mesa do hot-seat existe desde o primeiro render. */
      const mesaAgora = (): NonNullable<ReturnType<typeof partida.getState>['mesa']> => {
        const atual = partida.getState().mesa;
        if (atual === null) throw new Error('hot-seat sem mesa');
        return atual;
      };

      let cliques = 0;
      while (mesaAgora().winner === null && cliques < MAXIMO_DE_CLIQUES) {
        const alvo = proximoClique(container, cliques);
        if (alvo === null) {
          throw new Error(
            `interface travada na fase ${mesaAgora().phase} ` +
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
            `clique ${cliques} recusado na fase ${mesaAgora().phase}: ` +
              `${screen.getByRole('alert').textContent}`,
          );
        }
      }

      const mesa = mesaAgora();
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
