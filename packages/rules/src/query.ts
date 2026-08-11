/**
 * Consultas derivadas do estado. Nada aqui muda o estado — são as perguntas
 * que as validações de ação fazem o tempo todo, num lugar só, para não haver
 * duas implementações da mesma regra divergindo.
 */

import {
  RESOURCES,
  type EdgeId,
  type HexId,
  type PlayerId,
  type PortType,
  type Resource,
  type ResourceCount,
  type VertexId,
} from './types.js';
import type { GameState, PlayerState } from './state.js';

export function findPlayer(state: GameState, id: PlayerId): PlayerState | undefined {
  return state.players.find((p) => p.id === id);
}

/** O jogador da vez. Nunca é `undefined`: o índice é sempre válido por construção. */
export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex] as PlayerState;
}

export function canAfford(have: ResourceCount, cost: ResourceCount): boolean {
  return RESOURCES.every((r) => have[r] >= cost[r]);
}

export function addResources(target: ResourceCount, delta: ResourceCount): void {
  for (const r of RESOURCES) target[r] += delta[r];
}

export function subtractResources(target: ResourceCount, delta: ResourceCount): void {
  for (const r of RESOURCES) target[r] -= delta[r];
}

export function countResources(count: ResourceCount): number {
  return RESOURCES.reduce((sum, r) => sum + count[r], 0);
}

/** Expande a mão num array plano — usado pelo roubo aleatório do Saqueador. */
export function flattenHand(count: ResourceCount): Resource[] {
  const out: Resource[] = [];
  for (const r of RESOURCES) {
    for (let i = 0; i < count[r]; i++) out.push(r);
  }
  return out;
}

export function vertexIsFree(state: GameState, vertexId: VertexId): boolean {
  return state.buildings[vertexId] === undefined;
}

/**
 * Regra de distância (§3.2): um assentamento só pode ir num vértice cujos
 * vizinhos diretos estejam **todos vazios**. Vale a partida inteira, não só
 * no setup.
 */
export function distanceRuleSatisfied(state: GameState, vertexId: VertexId): boolean {
  const node = state.board.vertices[vertexId];
  if (node === undefined) return false;
  return node.adjacentVertices.every((v) => state.buildings[v] === undefined);
}

/** O jogador tem alguma estrada tocando este vértice? */
export function hasOwnRoadAtVertex(
  state: GameState,
  playerId: PlayerId,
  vertexId: VertexId,
): boolean {
  const node = state.board.vertices[vertexId];
  if (node === undefined) return false;
  return node.edges.some((e) => state.roads[e]?.owner === playerId);
}

/**
 * Um vértice serve de ponto de conexão para uma nova estrada do jogador se ele
 * tem construção própria ali, ou estrada própria ali sem construção adversária
 * bloqueando (não se constrói estrada *através* de assentamento adversário).
 */
export function canExtendRoadFromVertex(
  state: GameState,
  playerId: PlayerId,
  vertexId: VertexId,
): boolean {
  const building = state.buildings[vertexId];
  if (building !== undefined) {
    return building.owner === playerId;
  }
  return hasOwnRoadAtVertex(state, playerId, vertexId);
}

export function roadPlacementIsConnected(
  state: GameState,
  playerId: PlayerId,
  edgeId: EdgeId,
): boolean {
  const edge = state.board.edges[edgeId];
  if (edge === undefined) return false;
  return edge.vertices.some((v) => canExtendRoadFromVertex(state, playerId, v));
}

/** Tipos de porto acessíveis ao jogador pelas construções que ele tem. */
export function playerPorts(state: GameState, playerId: PlayerId): PortType[] {
  const out = new Set<PortType>();
  for (const [vertexId, building] of Object.entries(state.buildings)) {
    if (building.owner !== playerId) continue;
    const port = state.board.vertices[vertexId]?.port;
    if (port != null) out.add(port);
  }
  return [...out];
}

/**
 * Melhor taxa de troca com o banco para um recurso: 2:1 com porto específico,
 * 3:1 com porto genérico, 4:1 sem porto (§3.3).
 */
export function bankTradeRate(state: GameState, playerId: PlayerId, give: Resource): number {
  const ports = playerPorts(state, playerId);
  if (ports.includes(give)) return 2;
  if (ports.includes('generic')) return 3;
  return 4;
}

/** Jogadores com assentamento ou cidade em algum vértice deste hexágono. */
export function playersAdjacentToHex(state: GameState, hexId: HexId): PlayerId[] {
  const hex = state.board.hexes[hexId];
  if (hex === undefined) return [];
  const out = new Set<PlayerId>();
  for (const vertexId of hex.vertices) {
    const building = state.buildings[vertexId];
    if (building !== undefined) out.add(building.owner);
  }
  return [...out];
}

/**
 * Alvos válidos de roubo: adversários com construção adjacente ao hexágono do
 * Saqueador **e com pelo menos 1 carta**. Quem está adjacente mas sem cartas
 * não é alvo — não há o que roubar.
 */
export function stealCandidates(state: GameState, hexId: HexId, thief: PlayerId): PlayerId[] {
  return playersAdjacentToHex(state, hexId)
    .filter((id) => id !== thief)
    .filter((id) => {
      const p = findPlayer(state, id);
      return p !== undefined && countResources(p.resources) > 0;
    });
}

export function playerBuildings(
  state: GameState,
  playerId: PlayerId,
): { vertexId: VertexId; type: 'settlement' | 'city' }[] {
  const out: { vertexId: VertexId; type: 'settlement' | 'city' }[] = [];
  for (const [vertexId, building] of Object.entries(state.buildings)) {
    if (building.owner === playerId) out.push({ vertexId, type: building.type });
  }
  return out;
}
