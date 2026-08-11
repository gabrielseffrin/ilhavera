/**
 * Cartas de Progresso — §3.1 e §3.3 do roadmap.
 *
 * Restrições que valem para todas: não podem ser jogadas no mesmo turno em que
 * foram compradas, e no máximo 1 por turno. Cartas de Ponto de Vitória nunca
 * são "jogadas" — só contam no fim.
 */

import type { ErrorCode } from '../errors.js';
import type { GameState, OwnedDevCard } from '../state.js';
import {
  COSTS,
  RESOURCES,
  emptyResourceCount,
  type DevCard,
  type PlayerId,
  type Resource,
} from '../types.js';
import { addResources, canAfford, subtractResources } from '../query.js';
import type { Emit } from './kit.js';
import type { ActionOf } from './types.js';

export function validateBuyDevCard(
  state: GameState,
  action: ActionOf<'buyDevCard'>,
): ErrorCode | null {
  const player = state.players.find((p) => p.id === action.player);
  if (player === undefined) return 'UNKNOWN_PLAYER';
  if (state.devDeck.length === 0) return 'DEV_DECK_EMPTY';
  if (!canAfford(player.resources, COSTS.devCard)) return 'INSUFFICIENT_RESOURCES';
  return null;
}

export function applyBuyDevCard(
  draft: GameState,
  action: ActionOf<'buyDevCard'>,
  emit: Emit,
): void {
  const player = draft.players.find((p) => p.id === action.player);
  if (player === undefined) return;

  subtractResources(player.resources, COSTS.devCard);
  addResources(draft.bank, COSTS.devCard);

  const card = draft.devDeck.pop() as DevCard;
  player.devCards.push({ card, boughtOnTurn: draft.turnNumber, played: false });

  emit({ type: 'devCardBought', actor: player.id, data: { deckLeft: draft.devDeck.length } });
}

/**
 * Encontra uma carta jogável do tipo pedido, distinguindo os dois motivos de
 * recusa — "não tenho" é erro diferente de "comprei agora".
 */
function findPlayableCard(
  state: GameState,
  playerId: PlayerId,
  card: DevCard,
): { card: OwnedDevCard } | { error: ErrorCode } {
  const player = state.players.find((p) => p.id === playerId);
  if (player === undefined) return { error: 'UNKNOWN_PLAYER' };

  const owned = player.devCards.filter((c) => c.card === card && !c.played);
  if (owned.length === 0) return { error: 'DEV_CARD_NOT_OWNED' };

  const playable = owned.find((c) => c.boughtOnTurn < state.turnNumber);
  if (playable === undefined) return { error: 'DEV_CARD_BOUGHT_THIS_TURN' };

  return { card: playable };
}

export function validatePlayDevCard(
  state: GameState,
  playerId: PlayerId,
  card: DevCard,
): ErrorCode | null {
  if (card === 'victoryPoint') return 'DEV_CARD_NOT_PLAYABLE';
  if (state.devCardPlayedThisTurn) return 'DEV_CARD_ALREADY_PLAYED';
  const found = findPlayableCard(state, playerId, card);
  return 'error' in found ? found.error : null;
}

/** Marca a carta como jogada e fecha a cota de 1 carta por turno. */
function consumeCard(draft: GameState, playerId: PlayerId, card: DevCard, emit: Emit): void {
  const found = findPlayableCard(draft, playerId, card);
  if ('error' in found) return;
  found.card.played = true;
  draft.devCardPlayedThisTurn = true;
  emit({ type: 'devCardPlayed', actor: playerId, data: { card } });
}

// ---------------------------------------------------------------- Soldado

export function validatePlayKnight(
  state: GameState,
  action: ActionOf<'playKnight'>,
): ErrorCode | null {
  return validatePlayDevCard(state, action.player, 'knight');
}

export function applyPlayKnight(
  draft: GameState,
  action: ActionOf<'playKnight'>,
  emit: Emit,
): void {
  consumeCard(draft, action.player, 'knight', emit);

  const player = draft.players.find((p) => p.id === action.player);
  if (player !== undefined) player.knightsPlayed += 1;

  // Um Soldado pode ser jogado ANTES da rolagem (§3.3). Nesse caso, depois de
  // mover o Saqueador o jogador ainda precisa rolar os dados.
  draft.robberReturnPhase = draft.phase === 'awaitingRoll' ? 'awaitingRoll' : 'main';
  draft.phase = 'movingRobber';
}

// ------------------------------------------------ Construção de Estradas

export function validatePlayRoadBuilding(
  state: GameState,
  action: ActionOf<'playRoadBuilding'>,
): ErrorCode | null {
  return validatePlayDevCard(state, action.player, 'roadBuilding');
}

export function applyPlayRoadBuilding(
  draft: GameState,
  action: ActionOf<'playRoadBuilding'>,
  emit: Emit,
): void {
  consumeCard(draft, action.player, 'roadBuilding', emit);
  const player = draft.players.find((p) => p.id === action.player);
  // Sem peças no estoque não adianta dar estradas grátis.
  draft.freeRoadsRemaining = Math.min(2, player?.piecesLeft.roads ?? 0);
}

// -------------------------------------------------------------- Descoberta

export function validatePlayYearOfPlenty(
  state: GameState,
  action: ActionOf<'playYearOfPlenty'>,
): ErrorCode | null {
  const base = validatePlayDevCard(state, action.player, 'yearOfPlenty');
  if (base !== null) return base;

  const wanted = emptyResourceCount();
  for (const r of action.resources) {
    if (!RESOURCES.includes(r)) return 'INVALID_ACTION';
    wanted[r] += 1;
  }
  // Os 2 recursos precisam existir no banco — inclusive quando são iguais.
  for (const r of RESOURCES) {
    if (state.bank[r] < wanted[r]) return 'BANK_DEPLETED';
  }
  return null;
}

export function applyPlayYearOfPlenty(
  draft: GameState,
  action: ActionOf<'playYearOfPlenty'>,
  emit: Emit,
): void {
  consumeCard(draft, action.player, 'yearOfPlenty', emit);
  const player = draft.players.find((p) => p.id === action.player);
  if (player === undefined) return;

  for (const r of action.resources) {
    draft.bank[r] -= 1;
    player.resources[r] += 1;
  }

  emit({
    type: 'yearOfPlentyResolved',
    actor: player.id,
    data: { resources: [...action.resources] },
  });
}

// --------------------------------------------------------------- Monopólio

export function validatePlayMonopoly(
  state: GameState,
  action: ActionOf<'playMonopoly'>,
): ErrorCode | null {
  const base = validatePlayDevCard(state, action.player, 'monopoly');
  if (base !== null) return base;
  if (!RESOURCES.includes(action.resource)) return 'INVALID_ACTION';
  return null;
}

export function applyPlayMonopoly(
  draft: GameState,
  action: ActionOf<'playMonopoly'>,
  emit: Emit,
): void {
  consumeCard(draft, action.player, 'monopoly', emit);
  const player = draft.players.find((p) => p.id === action.player);
  if (player === undefined) return;

  const resource: Resource = action.resource;
  const taken: Record<PlayerId, number> = {};

  for (const other of draft.players) {
    if (other.id === player.id) continue;
    const amount = other.resources[resource];
    if (amount <= 0) continue;
    other.resources[resource] = 0;
    player.resources[resource] += amount;
    taken[other.id] = amount;
  }

  // Ninguém ter o recurso é resultado legítimo: a carta foi gasta à toa.
  emit({ type: 'monopolyResolved', actor: player.id, data: { resource, taken } });
}
