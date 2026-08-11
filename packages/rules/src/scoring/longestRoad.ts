/**
 * Estrada Mais Longa — §3.4 e §4.3 do roadmap.
 *
 * A rota é um **trilho**: não repete arestas, mas pode repetir vértices. Um
 * assentamento ou cidade **adversário** interrompe a rota naquele vértice — a
 * rota pode terminar ali, mas não atravessar.
 *
 * Máximo de 15 arestas por jogador, então a busca exaustiva é trivial em custo
 * e não precisa de nenhuma esperteza que possa estar errada.
 */

import type { EdgeId, PlayerId, VertexId } from '../types.js';
import type { GameState } from '../state.js';
import { MIN_LONGEST_ROAD } from '../types.js';

/** Comprimento do maior trilho contínuo de estradas do jogador. */
export function longestRoadLength(state: GameState, playerId: PlayerId): number {
  // Subgrafo das arestas do jogador, indexado por vértice.
  const edgesByVertex = new Map<VertexId, EdgeId[]>();
  let edgeCount = 0;
  for (const [edgeId, road] of Object.entries(state.roads)) {
    if (road.owner !== playerId) continue;
    edgeCount++;
    const edge = state.board.edges[edgeId];
    if (edge === undefined) continue;
    for (const v of edge.vertices) {
      const list = edgesByVertex.get(v);
      if (list === undefined) edgesByVertex.set(v, [edgeId]);
      else list.push(edgeId);
    }
  }
  if (edgeCount === 0) return 0;

  /** Vértice bloqueado: construção de adversário interrompe a rota (§3.4). */
  const blocked = (v: VertexId): boolean => {
    const b = state.buildings[v];
    return b !== undefined && b.owner !== playerId;
  };

  const used = new Set<EdgeId>();
  let best = 0;

  const walk = (vertex: VertexId, depth: number): void => {
    if (depth > best) best = depth;
    // Chegou num vértice com construção adversária: a rota termina aqui.
    if (blocked(vertex)) return;
    for (const edgeId of edgesByVertex.get(vertex) ?? []) {
      if (used.has(edgeId)) continue;
      const edge = state.board.edges[edgeId];
      if (edge === undefined) continue;
      const next = edge.vertices[0] === vertex ? edge.vertices[1] : edge.vertices[0];
      used.add(edgeId);
      walk(next, depth + 1);
      used.delete(edgeId);
    }
  };

  // Partir de todo vértice do subgrafo. Começar num vértice bloqueado é
  // legítimo (a rota sai dele), o que não vale é passar por ele no meio.
  for (const vertex of edgesByVertex.keys()) {
    walk(vertex, 0);
  }

  return best;
}

export type LongestRoadHolder = { owner: PlayerId | null; size: number };

/**
 * Recalcula o dono do bônus.
 *
 * Regras de transferência (§3.4):
 * - mínimo de 5 segmentos;
 * - o detentor só perde para quem tiver **estritamente mais**;
 * - se a rota do detentor for quebrada e houver **empate** na nova maior rota,
 *   o bônus fica **sem dono** até alguém desempatar.
 */
export function recomputeLongestRoad(
  state: GameState,
  current: { owner: PlayerId | null; length: number },
): { owner: PlayerId | null; length: number } {
  const lengths = new Map<PlayerId, number>();
  for (const p of state.players) lengths.set(p.id, longestRoadLength(state, p.id));

  const maxLength = Math.max(0, ...lengths.values());
  if (maxLength < MIN_LONGEST_ROAD) {
    return { owner: null, length: 0 };
  }

  const leaders = [...lengths.entries()]
    .filter(([, len]) => len === maxLength)
    .map(([id]) => id);

  // O detentor mantém o bônus enquanto ninguém o superar estritamente —
  // inclusive quando empata no topo.
  if (current.owner !== null && leaders.includes(current.owner)) {
    return { owner: current.owner, length: maxLength };
  }

  // O detentor perdeu o topo. Só há novo dono se o líder for único; empate
  // deixa o bônus vago.
  if (leaders.length === 1) {
    return { owner: leaders[0] as PlayerId, length: maxLength };
  }
  return { owner: null, length: maxLength };
}
