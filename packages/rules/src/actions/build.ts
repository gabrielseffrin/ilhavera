/**
 * Construção durante o turno principal — §3.1 (custos) e §3.2 (distância).
 */

import type { ErrorCode } from '../errors.js';
import type { GameState } from '../state.js';
import { COSTS } from '../types.js';
import {
  addResources,
  canAfford,
  distanceRuleSatisfied,
  hasOwnRoadAtVertex,
  roadPlacementIsConnected,
  subtractResources,
  vertexIsFree,
} from '../query.js';
import type { Emit } from './kit.js';
import type { ActionOf } from './types.js';

export function validateBuildSettlement(
  state: GameState,
  action: ActionOf<'placeSettlement'>,
): ErrorCode | null {
  const player = state.players.find((p) => p.id === action.player);
  if (player === undefined) return 'UNKNOWN_PLAYER';
  if (state.board.vertices[action.vertexId] === undefined) return 'VERTEX_NOT_FOUND';
  if (!vertexIsFree(state, action.vertexId)) return 'VERTEX_OCCUPIED';
  if (!distanceRuleSatisfied(state, action.vertexId)) return 'DISTANCE_RULE_VIOLATION';
  // Fora do setup, o assentamento precisa encostar numa estrada própria.
  if (!hasOwnRoadAtVertex(state, player.id, action.vertexId)) return 'SETTLEMENT_NOT_CONNECTED';
  if (player.piecesLeft.settlements <= 0) return 'NO_PIECES_LEFT';
  if (!canAfford(player.resources, COSTS.settlement)) return 'INSUFFICIENT_RESOURCES';
  return null;
}

export function applyBuildSettlement(
  draft: GameState,
  action: ActionOf<'placeSettlement'>,
  emit: Emit,
): void {
  const player = draft.players.find((p) => p.id === action.player);
  if (player === undefined) return;

  subtractResources(player.resources, COSTS.settlement);
  addResources(draft.bank, COSTS.settlement);
  draft.buildings[action.vertexId] = { owner: player.id, type: 'settlement' };
  player.piecesLeft.settlements -= 1;

  emit({
    type: 'settlementPlaced',
    actor: player.id,
    data: { vertexId: action.vertexId, free: false },
  });
}

export function validateBuildRoad(
  state: GameState,
  action: ActionOf<'placeRoad'>,
): ErrorCode | null {
  const player = state.players.find((p) => p.id === action.player);
  if (player === undefined) return 'UNKNOWN_PLAYER';
  if (state.board.edges[action.edgeId] === undefined) return 'EDGE_NOT_FOUND';
  if (state.roads[action.edgeId] !== undefined) return 'EDGE_OCCUPIED';
  if (!roadPlacementIsConnected(state, player.id, action.edgeId)) return 'ROAD_NOT_CONNECTED';
  if (player.piecesLeft.roads <= 0) return 'NO_PIECES_LEFT';
  // Estradas da carta Construção de Estradas são grátis.
  if (state.freeRoadsRemaining <= 0 && !canAfford(player.resources, COSTS.road)) {
    return 'INSUFFICIENT_RESOURCES';
  }
  return null;
}

export function applyBuildRoad(draft: GameState, action: ActionOf<'placeRoad'>, emit: Emit): void {
  const player = draft.players.find((p) => p.id === action.player);
  if (player === undefined) return;

  const free = draft.freeRoadsRemaining > 0;
  if (free) {
    draft.freeRoadsRemaining -= 1;
  } else {
    subtractResources(player.resources, COSTS.road);
    addResources(draft.bank, COSTS.road);
  }

  draft.roads[action.edgeId] = { owner: player.id };
  player.piecesLeft.roads -= 1;

  emit({ type: 'roadPlaced', actor: player.id, data: { edgeId: action.edgeId, free } });
}

export function validateBuildCity(
  state: GameState,
  action: ActionOf<'buildCity'>,
): ErrorCode | null {
  const player = state.players.find((p) => p.id === action.player);
  if (player === undefined) return 'UNKNOWN_PLAYER';
  if (state.board.vertices[action.vertexId] === undefined) return 'VERTEX_NOT_FOUND';

  const building = state.buildings[action.vertexId];
  if (building === undefined || building.owner !== player.id) return 'NOT_YOUR_SETTLEMENT';
  if (building.type === 'city') return 'ALREADY_CITY';

  if (player.piecesLeft.cities <= 0) return 'NO_PIECES_LEFT';
  if (!canAfford(player.resources, COSTS.city)) return 'INSUFFICIENT_RESOURCES';
  return null;
}

export function applyBuildCity(draft: GameState, action: ActionOf<'buildCity'>, emit: Emit): void {
  const player = draft.players.find((p) => p.id === action.player);
  const building = draft.buildings[action.vertexId];
  if (player === undefined || building === undefined) return;

  subtractResources(player.resources, COSTS.city);
  addResources(draft.bank, COSTS.city);
  building.type = 'city';
  player.piecesLeft.cities -= 1;
  // O assentamento volta para o estoque do jogador.
  player.piecesLeft.settlements += 1;

  emit({ type: 'cityBuilt', actor: player.id, data: { vertexId: action.vertexId } });
}
