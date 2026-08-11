/**
 * Replay determinístico — §4.1 e §8 do roadmap.
 *
 * "Replay do log com a mesma seed reproduz estado idêntico (hash do estado)."
 *
 * É a propriedade que sustenta três coisas de uma vez: reconexão, recuperação
 * de queda do servidor (§7: snapshot + replay) e reprodução de bug de regra a
 * partir do `roomId`/`version` que o botão de reportar bug envia (§9, Fase 6).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { playRandomGame, replay } from '../helpers/driver.js';
import { hashState } from '../helpers/invariants.js';
import { createGame } from '../../src/game.js';
import { reduce } from '../../src/reduce.js';

const HEAVY = process.env['HEAVY'] === '1';

describe('replay determinístico', () => {
  it('reproduz o estado final exato a partir do log de ações', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), (n) => {
        const seed = `replay-${n}`;
        const original = playRandomGame(seed, { includeTradeOffers: true, maxSteps: 1200 });
        const reproduzido = replay(seed, 4, original.actions);
        expect(hashState(reproduzido)).toBe(hashState(original.state));
      }),
      { numRuns: HEAVY ? 2000 : 60 },
    );
  });

  it('reproduz o estado em QUALQUER ponto intermediário, não só no fim', () => {
    // Reconexão precisa disso: o servidor reconstrói a sala do último snapshot
    // + as ações posteriores, e o resultado tem que bater exatamente.
    const seed = 'replay-parcial';
    const original = playRandomGame(seed, { maxSteps: 600 });

    const marcos = [10, 50, 120, 300].filter((m) => m <= original.actions.length);
    for (const marco of marcos) {
      const prefixo = original.actions.slice(0, marco);

      let esperado = createGame({
        id: `game-${seed}`,
        seed,
        players: [
          { id: 'p0', name: 'Jogador 1', color: 'red' },
          { id: 'p1', name: 'Jogador 2', color: 'blue' },
          { id: 'p2', name: 'Jogador 3', color: 'white' },
          { id: 'p3', name: 'Jogador 4', color: 'orange' },
        ],
      });
      for (const action of prefixo) {
        const r = reduce(esperado, action);
        expect(r.ok).toBe(true);
        if (r.ok) esperado = r.state;
      }

      expect(hashState(replay(seed, 4, prefixo))).toBe(hashState(esperado));
    }
  });

  it('produz partidas diferentes para seeds diferentes', () => {
    const a = playRandomGame('divergente-a', { maxSteps: 300 });
    const b = playRandomGame('divergente-b', { maxSteps: 300 });
    expect(hashState(a.state)).not.toBe(hashState(b.state));
  });

  it('mantém o cursor do PRNG consistente entre execuções', () => {
    const a = playRandomGame('cursor', { maxSteps: 400 });
    const b = playRandomGame('cursor', { maxSteps: 400 });
    expect(a.state.rngCursor).toBe(b.state.rngCursor);
    expect(a.steps).toBe(b.steps);
  });

  it('nunca aceita uma ação enumerada como legal e depois rejeitada', () => {
    // O driver já lança se isso acontecer; aqui isso vira asserção explícita,
    // porque é o contrato entre `enumerateLegalActions` e `reduce` — e é o que
    // garante que o cliente não destaque jogadas que o servidor recusa (§4.2).
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000 }), (n) => {
        expect(() =>
          playRandomGame(`coerencia-${n}`, { includeTradeOffers: true, maxSteps: 800 }),
        ).not.toThrow();
      }),
      { numRuns: HEAVY ? 1000 : 40 },
    );
  });

  it('não muta o estado de entrada — reduce é puro', () => {
    const seed = 'imutabilidade';
    const inicial = createGame({
      id: 'x',
      seed,
      players: [
        { id: 'p0', name: 'A', color: 'red' },
        { id: 'p1', name: 'B', color: 'blue' },
        { id: 'p2', name: 'C', color: 'white' },
      ],
    });
    const antes = hashState(inicial);

    const vertexId = inicial.board.vertexOrder[0]!;
    const r = reduce(inicial, {
      type: 'placeSettlement',
      player: inicial.players[0]!.id,
      vertexId,
    });

    expect(r.ok).toBe(true);
    expect(hashState(inicial)).toBe(antes);
    if (r.ok) expect(hashState(r.state)).not.toBe(antes);
  });

  it('não muta o estado nem quando a ação é rejeitada', () => {
    const inicial = createGame({
      id: 'x',
      seed: 'rejeicao',
      players: [
        { id: 'p0', name: 'A', color: 'red' },
        { id: 'p1', name: 'B', color: 'blue' },
        { id: 'p2', name: 'C', color: 'white' },
      ],
    });
    const antes = hashState(inicial);

    const r = reduce(inicial, { type: 'rollDice', player: 'p0' });
    expect(r.ok).toBe(false);
    expect(hashState(inicial)).toBe(antes);
  });
});
