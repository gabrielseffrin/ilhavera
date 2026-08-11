/**
 * Testes de propriedade — §8, nível 2 do roadmap.
 *
 * "Executar milhares de partidas com ações aleatórias legais e verificar
 * invariantes que **nunca** podem quebrar."
 *
 * Dois níveis: o padrão roda em todo PR (rápido o bastante para não atrapalhar);
 * `HEAVY=1` roda as 10.000 partidas do critério de aceite da Fase 1.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { playRandomGame } from '../helpers/driver.js';
import { checkInvariants } from '../helpers/invariants.js';

const HEAVY = process.env['HEAVY'] === '1';
const PARTIDAS = HEAVY ? 10_000 : 300;

describe(`invariantes em ${PARTIDAS} partidas aleatórias`, () => {
  it('nenhuma partida viola nenhum invariante, em nenhuma ação', () => {
    let totalPassos = 0;
    let terminadas = 0;

    for (let i = 0; i < PARTIDAS; i++) {
      const seed = `prop-${i}`;
      const result = playRandomGame(seed, {
        includeTradeOffers: i % 3 === 0,
        boardMode: i % 5 === 0 ? 'random' : 'balanced',
        playerCount: 3 + (i % 2),
        onStep: ({ state, action, step }) => {
          const violations = checkInvariants(state);
          if (violations.length > 0) {
            throw new Error(
              `seed=${seed} passo=${step} ação=${action.type}\n` +
                violations.map((v) => `  ✗ ${v.invariant}: ${v.detail}`).join('\n'),
            );
          }
        },
      });
      totalPassos += result.steps;
      if (result.finished) terminadas++;
    }

    expect(totalPassos).toBeGreaterThan(0);
    // A maioria esmagadora tem que terminar de fato, senão o teste está
    // exercitando só a abertura das partidas.
    expect(terminadas / PARTIDAS).toBeGreaterThan(0.9);
  });

  it('mantém os invariantes com mesas de 3 jogadores', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (n) => {
        playRandomGame(`tres-${n}`, {
          playerCount: 3,
          maxSteps: 1500,
          onStep: ({ state }) => {
            const violations = checkInvariants(state);
            if (violations.length > 0) {
              throw new Error(violations.map((v) => `${v.invariant}: ${v.detail}`).join('; '));
            }
          },
        });
      }),
      { numRuns: HEAVY ? 500 : 25 },
    );
  });

  it('mantém os invariantes no modo de tabuleiro aleatório puro', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (n) => {
        playRandomGame(`aleatorio-${n}`, {
          boardMode: 'random',
          maxSteps: 1500,
          onStep: ({ state }) => {
            const violations = checkInvariants(state);
            if (violations.length > 0) {
              throw new Error(violations.map((v) => `${v.invariant}: ${v.detail}`).join('; '));
            }
          },
        });
      }),
      { numRuns: HEAVY ? 500 : 25 },
    );
  });
});
