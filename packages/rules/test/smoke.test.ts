import { describe, expect, it } from 'vitest';

import { playRandomGame } from './helpers/driver.js';
import { checkInvariants } from './helpers/invariants.js';

describe('smoke: partidas aleatórias completas', () => {
  it('joga 20 partidas do setup ao fim sem violar invariante', () => {
    let finished = 0;
    const passos: number[] = [];

    for (let i = 0; i < 20; i++) {
      const result = playRandomGame(`smoke-${i}`, {
        includeTradeOffers: true,
        onStep: ({ state, action, step }) => {
          const violations = checkInvariants(state);
          if (violations.length > 0) {
            throw new Error(
              `partida smoke-${i}, passo ${step} (${action.type}): ` +
                violations.map((v) => `${v.invariant} — ${v.detail}`).join('; '),
            );
          }
        },
      });
      if (result.finished) finished++;
      passos.push(result.steps);
    }

    // Não é asserção de regra, é asserção sobre o driver: se quase nenhuma
    // partida terminasse, os testes de propriedade estariam exercitando só a
    // abertura e nunca vitória, cidades ou bônus.
    expect(finished).toBeGreaterThan(15);
    expect(Math.max(...passos)).toBeLessThan(4000);
  });
});
