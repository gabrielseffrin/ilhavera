/**
 * Fase do Saqueador — §3.3 do roadmap.
 *
 * 1. quem tem 8+ cartas descarta metade (em paralelo);
 * 2. o jogador da vez move o Saqueador para um hexágono **diferente**;
 * 3. rouba 1 carta aleatória de um jogador adjacente ao novo hexágono.
 */

import type { ErrorCode } from '../errors.js';
import type { GameState } from '../state.js';
import { RESOURCES, type Resource } from '../types.js';
import { addResources, countResources, flattenHand, stealCandidates } from '../query.js';
import { randomInt } from '../rng.js';
import type { Emit } from './kit.js';
import type { ActionOf } from './types.js';

export function validateDiscard(
  state: GameState,
  action: ActionOf<'discard'>,
): ErrorCode | null {
  const required = state.pendingDiscards[action.player];
  if (required === undefined) return 'NOTHING_TO_DISCARD';

  const player = state.players.find((p) => p.id === action.player);
  if (player === undefined) return 'UNKNOWN_PLAYER';

  for (const r of RESOURCES) {
    const n = action.resources[r];
    if (!Number.isInteger(n) || n < 0) return 'INVALID_DISCARD';
    if (player.resources[r] < n) return 'INSUFFICIENT_RESOURCES';
  }
  if (countResources(action.resources) !== required) return 'INVALID_DISCARD';
  return null;
}

export function applyDiscard(draft: GameState, action: ActionOf<'discard'>, emit: Emit): void {
  const player = draft.players.find((p) => p.id === action.player);
  if (player === undefined) return;

  for (const r of RESOURCES) {
    player.resources[r] -= action.resources[r];
  }
  addResources(draft.bank, action.resources);
  delete draft.pendingDiscards[action.player];

  emit({ type: 'discarded', actor: player.id, data: { resources: { ...action.resources } } });

  // O turno só prossegue quando todos confirmarem.
  if (Object.keys(draft.pendingDiscards).length === 0) {
    draft.phase = 'movingRobber';
  }
}

export function validateMoveRobber(
  state: GameState,
  action: ActionOf<'moveRobber'>,
): ErrorCode | null {
  if (state.board.hexes[action.hexId] === undefined) return 'HEX_NOT_FOUND';
  if (action.hexId === state.robberHex) return 'ROBBER_SAME_HEX';

  const candidates = stealCandidates(state, action.hexId, action.player);
  if (candidates.length === 0) {
    // Ninguém para roubar: o comando não pode indicar alvo.
    if (action.stealFrom !== null) return 'INVALID_STEAL_TARGET';
    return null;
  }
  // Havendo alvos, escolher um é obrigatório.
  if (action.stealFrom === null || !candidates.includes(action.stealFrom)) {
    return 'INVALID_STEAL_TARGET';
  }
  return null;
}

export function applyMoveRobber(
  draft: GameState,
  action: ActionOf<'moveRobber'>,
  emit: Emit,
): void {
  draft.robberHex = action.hexId;
  emit({ type: 'robberMoved', actor: action.player, data: { hexId: action.hexId } });

  if (action.stealFrom !== null) {
    const stolen = stealRandomCard(draft, action.player, action.stealFrom);
    emit({
      type: 'stolen',
      actor: action.player,
      data: { from: action.stealFrom, resource: stolen },
    });
  }

  draft.phase = draft.robberReturnPhase;
}

/**
 * Rouba uma carta aleatória: a mão da vítima é expandida num array plano e o
 * índice sai do PRNG semeado, então o roubo é reproduzível no replay.
 */
function stealRandomCard(draft: GameState, thief: string, victimId: string): Resource | null {
  const victim = draft.players.find((p) => p.id === victimId);
  const thiefState = draft.players.find((p) => p.id === thief);
  if (victim === undefined || thiefState === undefined) return null;

  const hand = flattenHand(victim.resources);
  if (hand.length === 0) return null;

  const pickIndex = randomInt(draft.seed, draft.rngCursor, hand.length);
  draft.rngCursor = pickIndex.cursor;

  const resource = hand[pickIndex.value] as Resource;
  victim.resources[resource] -= 1;
  thiefState.resources[resource] += 1;
  return resource;
}
