/**
 * Fase do Saqueador — §3.3 do roadmap. Cobre os casos de borda de §8:
 * roubo de alvo com 0 cartas, 7 rolado quando ninguém tem 8+, descarte
 * paralelo.
 */
import { describe, expect, it } from 'vitest';

import { countResources } from '../src/query.js';
import { emptyResourceCount } from '../src/types.js';
import {
  apply,
  clearHand,
  completeSetup,
  expectError,
  grant,
  newGame,
  patch,
} from './helpers/setup.js';
import { clearBuildingsOnHex, hexVertices, placeBuilding } from './helpers/board.js';
import type { GameState } from '../src/state.js';

/** Força a partida a entrar na fase do Saqueador, como se tivesse saído 7. */
function faseSaqueador(state: GameState): GameState {
  return patch(state, (draft) => {
    draft.phase = 'movingRobber';
    draft.robberReturnPhase = 'main';
  });
}

function base(): GameState {
  let s = completeSetup(newGame());
  for (const p of s.players) s = clearHand(s, p.id);
  return s;
}

describe('descarte com 7', () => {
  it('não exige descarte de quem tem menos de 8 cartas', () => {
    let s = base();
    s = grant(s, 'ana', { lumber: 7 });

    const comSete = forcarSete(s);
    expect(comSete.lastRoll!.total).toBe(7);
    expect(comSete.pendingDiscards).toEqual({});
    expect(comSete.phase).toBe('movingRobber');
  });

  it('exige metade arredondada para baixo de quem tem 8 ou mais', () => {
    let s = base();
    s = grant(s, 'ana', { lumber: 8 });
    s = grant(s, 'bruno', { wool: 9 });
    s = grant(s, 'carla', { ore: 7 });

    const comSete = forcarSete(s);
    expect(comSete.phase).toBe('discarding');
    expect(comSete.pendingDiscards).toEqual({ ana: 4, bruno: 4 });
    expect(comSete.pendingDiscards['carla']).toBeUndefined();
  });

  it('aceita descartes em paralelo e em qualquer ordem', () => {
    let s = base();
    s = grant(s, 'ana', { lumber: 8 });
    s = grant(s, 'bruno', { wool: 8 });
    s = forcarSete(s);

    expect(s.phase).toBe('discarding');

    // Bruno responde primeiro, mesmo não sendo o jogador da vez.
    s = apply(s, {
      type: 'discard',
      player: 'bruno',
      resources: { ...emptyResourceCount(), wool: 4 },
    });
    expect(s.phase).toBe('discarding');
    expect(s.pendingDiscards).toEqual({ ana: 4 });

    s = apply(s, {
      type: 'discard',
      player: 'ana',
      resources: { ...emptyResourceCount(), lumber: 4 },
    });
    expect(s.phase).toBe('movingRobber');
    expect(s.pendingDiscards).toEqual({});
  });

  it('devolve as cartas descartadas ao banco', () => {
    let s = base();
    s = grant(s, 'ana', { lumber: 8 });
    s = forcarSete(s);
    const bancoAntes = s.bank.lumber;

    s = apply(s, {
      type: 'discard',
      player: 'ana',
      resources: { ...emptyResourceCount(), lumber: 4 },
    });
    expect(s.bank.lumber).toBe(bancoAntes + 4);
    expect(s.players.find((p) => p.id === 'ana')!.resources.lumber).toBe(4);
  });

  it('recusa descarte com quantidade errada', () => {
    let s = base();
    s = grant(s, 'ana', { lumber: 8 });
    s = forcarSete(s);
    expectError(
      s,
      { type: 'discard', player: 'ana', resources: { ...emptyResourceCount(), lumber: 3 } },
      'INVALID_DISCARD',
    );
    expectError(
      s,
      { type: 'discard', player: 'ana', resources: { ...emptyResourceCount(), lumber: 5 } },
      'INVALID_DISCARD',
    );
  });

  it('recusa descarte de cartas que o jogador não tem', () => {
    let s = base();
    s = grant(s, 'ana', { lumber: 8 });
    s = forcarSete(s);
    expectError(
      s,
      { type: 'discard', player: 'ana', resources: { ...emptyResourceCount(), ore: 4 } },
      'INSUFFICIENT_RESOURCES',
    );
  });

  it('recusa descarte de quem não deve nada', () => {
    let s = base();
    s = grant(s, 'ana', { lumber: 8 });
    s = grant(s, 'carla', { ore: 3 });
    s = forcarSete(s);
    expectError(
      s,
      { type: 'discard', player: 'carla', resources: { ...emptyResourceCount(), ore: 1 } },
      'NOTHING_TO_DISCARD',
    );
  });

  it('bloqueia mover o Saqueador antes de todos descartarem', () => {
    let s = base();
    s = grant(s, 'ana', { lumber: 8 });
    s = grant(s, 'bruno', { wool: 8 });
    s = forcarSete(s);

    const destino = s.board.hexOrder.find((h) => h !== s.robberHex)!;
    expectError(
      s,
      { type: 'moveRobber', player: 'ana', hexId: destino, stealFrom: null },
      'INVALID_PHASE',
    );
  });
});

describe('mover o Saqueador', () => {
  it('exige hexágono diferente do atual', () => {
    const s = faseSaqueador(base());
    expectError(
      s,
      { type: 'moveRobber', player: 'ana', hexId: s.robberHex, stealFrom: null },
      'ROBBER_SAME_HEX',
    );
  });

  it('recusa hexágono inexistente', () => {
    const s = faseSaqueador(base());
    expectError(
      s,
      { type: 'moveRobber', player: 'ana', hexId: 'nao-existe', stealFrom: null },
      'HEX_NOT_FOUND',
    );
  });

  it('move e volta para a fase principal', () => {
    let s = faseSaqueador(base());
    const destino = s.board.hexOrder.find(
      (h) => h !== s.robberHex && hexVertices(s, h).every((v) => s.buildings[v] === undefined),
    )!;
    s = apply(s, { type: 'moveRobber', player: 'ana', hexId: destino, stealFrom: null });
    expect(s.robberHex).toBe(destino);
    expect(s.phase).toBe('main');
  });

  it('rouba 1 carta do alvo escolhido', () => {
    let s = base();
    const hexId = s.board.hexOrder.find((h) => h !== s.robberHex)!;
    s = clearBuildingsOnHex(s, hexId);
    s = placeBuilding(s, 'bruno', hexVertices(s, hexId)[0]!, 'settlement');
    s = grant(s, 'bruno', { ore: 3 });
    s = faseSaqueador(s);

    s = apply(s, { type: 'moveRobber', player: 'ana', hexId, stealFrom: 'bruno' });

    expect(countResources(s.players.find((p) => p.id === 'bruno')!.resources)).toBe(2);
    expect(countResources(s.players.find((p) => p.id === 'ana')!.resources)).toBe(1);
  });

  it('não considera alvo quem está adjacente mas com 0 cartas', () => {
    let s = base();
    const hexId = s.board.hexOrder.find((h) => h !== s.robberHex)!;
    s = clearBuildingsOnHex(s, hexId);
    s = placeBuilding(s, 'bruno', hexVertices(s, hexId)[0]!, 'settlement');
    s = faseSaqueador(s);

    // Bruno está adjacente, mas sem cartas: não há o que roubar.
    expectError(
      s,
      { type: 'moveRobber', player: 'ana', hexId, stealFrom: 'bruno' },
      'INVALID_STEAL_TARGET',
    );
    // E mover sem alvo é legítimo.
    const depois = apply(s, { type: 'moveRobber', player: 'ana', hexId, stealFrom: null });
    expect(depois.robberHex).toBe(hexId);
  });

  it('exige escolher alvo quando existe alvo válido', () => {
    let s = base();
    const hexId = s.board.hexOrder.find((h) => h !== s.robberHex)!;
    s = clearBuildingsOnHex(s, hexId);
    s = placeBuilding(s, 'bruno', hexVertices(s, hexId)[0]!, 'settlement');
    s = grant(s, 'bruno', { ore: 1 });
    s = faseSaqueador(s);

    expectError(
      s,
      { type: 'moveRobber', player: 'ana', hexId, stealFrom: null },
      'INVALID_STEAL_TARGET',
    );
  });

  it('recusa roubar de quem não está adjacente', () => {
    let s = base();
    const hexId = s.board.hexOrder.find((h) => h !== s.robberHex)!;
    s = clearBuildingsOnHex(s, hexId);
    s = grant(s, 'carla', { ore: 5 });
    s = faseSaqueador(s);

    expectError(
      s,
      { type: 'moveRobber', player: 'ana', hexId, stealFrom: 'carla' },
      'INVALID_STEAL_TARGET',
    );
  });

  it('recusa roubar de si mesmo', () => {
    let s = base();
    const hexId = s.board.hexOrder.find((h) => h !== s.robberHex)!;
    s = clearBuildingsOnHex(s, hexId);
    s = placeBuilding(s, 'ana', hexVertices(s, hexId)[0]!, 'settlement');
    s = grant(s, 'ana', { ore: 5 });
    s = faseSaqueador(s);

    expectError(
      s,
      { type: 'moveRobber', player: 'ana', hexId, stealFrom: 'ana' },
      'INVALID_STEAL_TARGET',
    );
  });

  it('é determinístico no que rouba, para o replay funcionar', () => {
    let s = base();
    const hexId = s.board.hexOrder.find((h) => h !== s.robberHex)!;
    s = clearBuildingsOnHex(s, hexId);
    s = placeBuilding(s, 'bruno', hexVertices(s, hexId)[0]!, 'settlement');
    s = grant(s, 'bruno', { ore: 2, wool: 2, grain: 2 });
    s = faseSaqueador(s);

    const a = apply(s, { type: 'moveRobber', player: 'ana', hexId, stealFrom: 'bruno' });
    const b = apply(s, { type: 'moveRobber', player: 'ana', hexId, stealFrom: 'bruno' });
    expect(a.players.find((p) => p.id === 'ana')!.resources).toEqual(
      b.players.find((p) => p.id === 'ana')!.resources,
    );
    expect(a.rngCursor).toBe(b.rngCursor);
  });
});

/** Avança o cursor do PRNG até a próxima rolagem dar 7, e rola. */
function forcarSete(state: GameState): GameState {
  for (let offset = 0; offset < 500; offset++) {
    const tentativa = patch(state, (draft) => {
      draft.phase = 'awaitingRoll';
      draft.rngCursor = state.rngCursor + offset;
    });
    const depois = apply(tentativa, { type: 'rollDice', player: 'ana' });
    if (depois.lastRoll!.total === 7) return depois;
  }
  throw new Error('não encontrei rolagem 7');
}
