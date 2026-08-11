/**
 * Fase de preparação — §3.2 do roadmap.
 *
 * Rodada 1 em ordem normal, rodada 2 em ordem inversa. O segundo assentamento
 * gera imediatamente 1 recurso de cada hexágono adjacente produtivo.
 */

import type { ErrorCode } from '../errors.js';
import type { GameState } from '../state.js';
import { emptyResourceCount, TERRAIN_PRODUCES, type ResourceCount } from '../types.js';
import { countResources, distanceRuleSatisfied, vertexIsFree } from '../query.js';
import type { Emit } from './kit.js';
import type { ActionOf } from './types.js';

export function validateSetupSettlement(
  state: GameState,
  action: ActionOf<'placeSettlement'>,
): ErrorCode | null {
  if (state.setupStep !== 'settlement') return 'INVALID_PHASE';
  if (state.board.vertices[action.vertexId] === undefined) return 'VERTEX_NOT_FOUND';
  if (!vertexIsFree(state, action.vertexId)) return 'VERTEX_OCCUPIED';
  if (!distanceRuleSatisfied(state, action.vertexId)) return 'DISTANCE_RULE_VIOLATION';
  return null;
}

export function applySetupSettlement(
  draft: GameState,
  action: ActionOf<'placeSettlement'>,
  emit: Emit,
): void {
  const player = draft.players.find((p) => p.id === action.player);
  if (player === undefined) return;

  draft.buildings[action.vertexId] = { owner: player.id, type: 'settlement' };
  player.piecesLeft.settlements -= 1;
  draft.setupStep = 'road';
  draft.lastSetupVertex = action.vertexId;

  emit({
    type: 'settlementPlaced',
    actor: player.id,
    data: { vertexId: action.vertexId, free: true },
  });

  // §3.2: só o assentamento da SEGUNDA rodada produz.
  if (draft.phase === 'setup2') {
    const gains = collectSetupProduction(draft, action.vertexId);
    if (countResources(gains) > 0) {
      emit({ type: 'setupProduction', actor: player.id, data: { gains } });
    }
  }
}

/**
 * Produção do segundo assentamento: 1 recurso por hexágono adjacente
 * produtivo. Beneficiário único, então a regra de escassez de §3.3 se resume a
 * "recebe o que houver no banco".
 */
function collectSetupProduction(draft: GameState, vertexId: string): ResourceCount {
  const gains = emptyResourceCount();
  const vertex = draft.board.vertices[vertexId];
  if (vertex === undefined) return gains;

  const player = draft.buildings[vertexId]?.owner;
  if (player === undefined) return gains;
  const playerState = draft.players.find((p) => p.id === player);
  if (playerState === undefined) return gains;

  for (const hexId of vertex.hexes) {
    const hex = draft.board.hexes[hexId];
    if (hex === undefined) continue;
    const resource = TERRAIN_PRODUCES[hex.terrain];
    if (resource === null) continue;
    if (draft.bank[resource] <= 0) continue;
    draft.bank[resource] -= 1;
    playerState.resources[resource] += 1;
    gains[resource] += 1;
  }
  return gains;
}

export function validateSetupRoad(
  state: GameState,
  action: ActionOf<'placeRoad'>,
): ErrorCode | null {
  if (state.setupStep !== 'road') return 'INVALID_PHASE';
  const edge = state.board.edges[action.edgeId];
  if (edge === undefined) return 'EDGE_NOT_FOUND';
  if (state.roads[action.edgeId] !== undefined) return 'EDGE_OCCUPIED';
  // A estrada do setup tem que encostar no assentamento recém-colocado —
  // não em qualquer construção antiga do jogador.
  if (state.lastSetupVertex === null) return 'INVALID_PHASE';
  if (!edge.vertices.includes(state.lastSetupVertex)) return 'ROAD_NOT_CONNECTED';
  return null;
}

export function applySetupRoad(draft: GameState, action: ActionOf<'placeRoad'>, emit: Emit): void {
  const player = draft.players.find((p) => p.id === action.player);
  if (player === undefined) return;

  draft.roads[action.edgeId] = { owner: player.id };
  player.piecesLeft.roads -= 1;
  emit({ type: 'roadPlaced', actor: player.id, data: { edgeId: action.edgeId, free: true } });

  advanceSetup(draft);
}

/**
 * Avança a ordem do setup.
 *
 * A virada de `setup1` para `setup2` **não** troca de jogador: o último a
 * colocar na rodada 1 é o primeiro a colocar na rodada 2 (ordem inversa).
 */
function advanceSetup(draft: GameState): void {
  draft.setupStep = 'settlement';
  draft.lastSetupVertex = null;

  if (draft.phase === 'setup1') {
    if (draft.currentPlayerIndex === draft.players.length - 1) {
      draft.phase = 'setup2';
    } else {
      draft.currentPlayerIndex += 1;
    }
    return;
  }

  if (draft.phase === 'setup2') {
    if (draft.currentPlayerIndex === 0) {
      // Setup terminou: o primeiro jogador abre a partida de verdade.
      draft.phase = 'awaitingRoll';
      draft.turnNumber = 1;
    } else {
      draft.currentPlayerIndex -= 1;
    }
  }
}
