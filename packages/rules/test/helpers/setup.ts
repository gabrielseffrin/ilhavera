/**
 * Utilitários para montar estados de teste.
 *
 * Só os testes podem fazer isso: dar recursos direto na mão de um jogador,
 * forçar uma fase, empilhar cartas. O motor não expõe nada disso — chegar num
 * estado é sempre resultado de ações legais na partida de verdade.
 */

import { produce } from 'immer';
import { expect } from 'vitest';

import { createGame, type CreateGameOptions } from '../../src/game.js';
import { reduce } from '../../src/reduce.js';
import { enumerateLegalActions } from '../../src/legal.js';
import type { Action } from '../../src/actions/types.js';
import type { GameState } from '../../src/state.js';
import type { ErrorCode } from '../../src/errors.js';
import { RESOURCES, type DevCard, type PlayerId, type Resource } from '../../src/types.js';

export const P = ['ana', 'bruno', 'carla', 'davi'] as const;

export function newGame(overrides: Partial<CreateGameOptions> = {}): GameState {
  return createGame({
    id: 'teste',
    seed: 'seed-de-teste',
    players: [
      { id: 'ana', name: 'Ana', color: 'red' },
      { id: 'bruno', name: 'Bruno', color: 'blue' },
      { id: 'carla', name: 'Carla', color: 'white' },
      { id: 'davi', name: 'Davi', color: 'orange' },
    ],
    // Ordem de assentos previsível deixa os testes legíveis.
    shufflePlayerOrder: false,
    ...overrides,
  });
}

/** Aplica uma ação exigindo sucesso. Falha o teste se o motor rejeitar. */
export function apply(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  if (!result.ok) {
    throw new Error(`ação ${action.type} rejeitada inesperadamente: ${result.error}`);
  }
  return result.state;
}

/** Aplica várias ações em sequência. */
export function applyAll(state: GameState, actions: Action[]): GameState {
  return actions.reduce(apply, state);
}

export function expectError(state: GameState, action: Action, code: ErrorCode): void {
  const result = reduce(state, action);
  expect(result.ok, `esperava rejeição ${code}, mas a ação passou`).toBe(false);
  if (!result.ok) expect(result.error).toBe(code);
}

export function expectOk(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  expect(result.ok, `esperava sucesso, veio ${result.ok ? '' : result.error}`).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/**
 * Roda o setup inteiro escolhendo sempre a primeira jogada legal. Determinístico
 * e suficiente para chegar rápido no estado "partida em andamento".
 */
export function completeSetup(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.phase === 'setup1' || s.phase === 'setup2') {
    if (guard++ > 100) throw new Error('setup não terminou');
    const player = s.players[s.currentPlayerIndex]!;
    const legal = enumerateLegalActions(s, player.id);
    const action = legal[0];
    if (action === undefined) throw new Error('setup travou sem ações legais');
    s = apply(s, action);
  }
  return s;
}

/**
 * Dá recursos a um jogador tirando do banco — mantém a conservação de 19
 * cartas por recurso, então os testes de invariante continuam válidos.
 */
export function grant(
  state: GameState,
  playerId: PlayerId,
  resources: Partial<Record<Resource, number>>,
): GameState {
  return produce(state, (draft) => {
    const player = draft.players.find((p) => p.id === playerId);
    if (player === undefined) throw new Error(`jogador ${playerId} não existe`);
    for (const r of RESOURCES) {
      const n = resources[r] ?? 0;
      if (n === 0) continue;
      player.resources[r] += n;
      draft.bank[r] -= n;
    }
  });
}

/** Zera a mão de um jogador devolvendo tudo ao banco. */
export function clearHand(state: GameState, playerId: PlayerId): GameState {
  return produce(state, (draft) => {
    const player = draft.players.find((p) => p.id === playerId);
    if (player === undefined) return;
    for (const r of RESOURCES) {
      draft.bank[r] += player.resources[r];
      player.resources[r] = 0;
    }
  });
}

/**
 * Coloca uma carta na mão do jogador como se tivesse sido comprada num turno
 * anterior (portanto jogável agora).
 */
export function giveDevCard(
  state: GameState,
  playerId: PlayerId,
  card: DevCard,
  boughtOnTurn = 0,
): GameState {
  return produce(state, (draft) => {
    const player = draft.players.find((p) => p.id === playerId);
    if (player === undefined) return;
    player.devCards.push({ card, boughtOnTurn, played: false });
    const index = draft.devDeck.indexOf(card);
    if (index >= 0) draft.devDeck.splice(index, 1);
  });
}

/** Empilha o topo do baralho para a próxima compra sair conhecida. */
export function stackDeck(state: GameState, card: DevCard): GameState {
  return produce(state, (draft) => {
    const index = draft.devDeck.indexOf(card);
    if (index < 0) throw new Error(`carta ${card} não está mais no baralho`);
    draft.devDeck.splice(index, 1);
    draft.devDeck.push(card);
  });
}

/** Edição livre do estado — atalho para armar cenários de borda. */
export function patch(state: GameState, recipe: (draft: GameState) => void): GameState {
  return produce(state, recipe);
}

/** Avança até ser a vez do jogador pedido, encerrando turnos. */
export function advanceToPlayer(state: GameState, playerId: PlayerId): GameState {
  let s = state;
  let guard = 0;
  while (s.players[s.currentPlayerIndex]!.id !== playerId) {
    if (guard++ > 20) throw new Error('não consegui chegar no jogador pedido');
    s = patch(s, (draft) => {
      draft.phase = 'main';
    });
    s = apply(s, { type: 'endTurn', player: s.players[s.currentPlayerIndex]!.id });
  }
  return s;
}
