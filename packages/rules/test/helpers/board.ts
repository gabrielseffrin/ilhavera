/**
 * Localizadores e montadores de cenário no tabuleiro.
 *
 * Os IDs de vértice e aresta são derivados da geometria, então escrever
 * `"0,0|1,-1|1,0"` num teste seria ilegível e quebraria ao primeiro ajuste de
 * convenção. Aqui os testes pedem o que querem ("um hexágono com o número 8",
 * "um caminho de 5 arestas") e recebem os IDs.
 */

import { produce } from 'immer';

import type { GameState } from '../../src/state.js';
import type { EdgeId, HexId, PlayerId, Terrain, VertexId } from '../../src/types.js';
import { makeEdgeId } from '../../src/board/coords.js';

export function findHexByNumber(state: GameState, n: number): HexId {
  const hit = state.board.hexOrder.find((h) => state.board.hexes[h]!.number === n);
  if (hit === undefined) throw new Error(`nenhum hexágono com o número ${n}`);
  return hit;
}

export function findHexByTerrain(state: GameState, terrain: Terrain): HexId {
  const hit = state.board.hexOrder.find((h) => state.board.hexes[h]!.terrain === terrain);
  if (hit === undefined) throw new Error(`nenhum hexágono de ${terrain}`);
  return hit;
}

/** Um hexágono produtivo com número, longe do Saqueador. */
export function findProductiveHex(state: GameState, terrain: Terrain): HexId {
  const hit = state.board.hexOrder.find(
    (h) =>
      state.board.hexes[h]!.terrain === terrain &&
      state.board.hexes[h]!.number !== null &&
      h !== state.robberHex,
  );
  if (hit === undefined) throw new Error(`nenhum hexágono produtivo de ${terrain}`);
  return hit;
}

export function hexVertices(state: GameState, hexId: HexId): VertexId[] {
  return state.board.hexes[hexId]!.vertices;
}

export function edgeBetween(state: GameState, a: VertexId, b: VertexId): EdgeId {
  const id = makeEdgeId(a, b);
  if (state.board.edges[id] === undefined) {
    throw new Error(`não existe aresta entre ${a} e ${b}`);
  }
  return id;
}

/**
 * Constrói um trilho (não repete arestas) com o comprimento pedido a partir de
 * um vértice, desviando de arestas que já têm estrada. Usado nos testes de
 * Estrada Mais Longa.
 */
export function buildTrail(
  state: GameState,
  start: VertexId,
  length: number,
  options: { simple?: boolean } = {},
): { edges: EdgeId[]; vertices: VertexId[] } {
  const edges: EdgeId[] = [];
  const vertices: VertexId[] = [start];
  const used = new Set<EdgeId>();

  const walk = (vertex: VertexId): boolean => {
    if (edges.length === length) return true;
    for (const edgeId of state.board.vertices[vertex]!.edges) {
      if (used.has(edgeId)) continue;
      if (state.roads[edgeId] !== undefined) continue;
      const edge = state.board.edges[edgeId]!;
      const next = edge.vertices[0] === vertex ? edge.vertices[1] : edge.vertices[0];
      // `simple` exige caminho sem repetir vértice. A diferença importa: num
      // ciclo, cortar um vértice do meio não parte a rota em dois — dá para
      // sair do próprio vértice cortado e percorrer o resto do anel.
      if (options.simple === true && vertices.includes(next)) continue;
      used.add(edgeId);
      edges.push(edgeId);
      vertices.push(next);
      if (walk(next)) return true;
      used.delete(edgeId);
      edges.pop();
      vertices.pop();
    }
    return false;
  };

  if (!walk(start)) throw new Error(`não achei trilho de ${length} arestas a partir de ${start}`);
  return { edges, vertices };
}

/** Coloca estradas direto no estado, debitando o estoque de peças. */
export function placeRoads(state: GameState, playerId: PlayerId, edges: EdgeId[]): GameState {
  return produce(state, (draft) => {
    const player = draft.players.find((p) => p.id === playerId)!;
    for (const edgeId of edges) {
      if (draft.roads[edgeId] !== undefined) throw new Error(`aresta ${edgeId} já ocupada`);
      draft.roads[edgeId] = { owner: playerId };
      player.piecesLeft.roads -= 1;
    }
  });
}

/** Coloca uma construção direto no estado, debitando o estoque de peças. */
export function placeBuilding(
  state: GameState,
  playerId: PlayerId,
  vertexId: VertexId,
  type: 'settlement' | 'city' = 'settlement',
): GameState {
  return produce(state, (draft) => {
    const player = draft.players.find((p) => p.id === playerId)!;
    draft.buildings[vertexId] = { owner: playerId, type };
    if (type === 'city') {
      player.piecesLeft.cities -= 1;
    } else {
      player.piecesLeft.settlements -= 1;
    }
  });
}

/**
 * Acha o vértice construível mais próximo para o jogador e estende a rede de
 * estradas até lá. Busca em largura a partir das construções que ele já tem,
 * sem atravessar construção adversária — é o caminho que ele realmente
 * poderia abrir na partida.
 */
export function findBuildableSpot(
  state: GameState,
  playerId: PlayerId,
): { state: GameState; vertexId: VertexId; edges: EdgeId[] } {
  const starts = Object.entries(state.buildings)
    .filter(([, b]) => b.owner === playerId)
    .map(([v]) => v);
  if (starts.length === 0) throw new Error(`${playerId} não tem construções`);

  const queue: { vertex: VertexId; edges: EdgeId[] }[] = starts.map((v) => ({
    vertex: v,
    edges: [],
  }));
  const seen = new Set(starts);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = state.board.vertices[current.vertex]!;

    const livre = state.buildings[current.vertex] === undefined;
    const distanciaOk = node.adjacentVertices.every((v) => state.buildings[v] === undefined);
    if (current.edges.length > 0 && livre && distanciaOk) {
      return {
        state: placeRoads(state, playerId, current.edges),
        vertexId: current.vertex,
        edges: current.edges,
      };
    }

    // Construção adversária corta a expansão da rede.
    const bloqueado =
      state.buildings[current.vertex] !== undefined &&
      state.buildings[current.vertex]!.owner !== playerId;
    if (bloqueado || current.edges.length >= 5) continue;

    for (const edgeId of node.edges) {
      if (state.roads[edgeId] !== undefined) continue;
      const edge = state.board.edges[edgeId]!;
      const next = edge.vertices[0] === current.vertex ? edge.vertices[1] : edge.vertices[0];
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ vertex: next, edges: [...current.edges, edgeId] });
    }
  }

  throw new Error(`não achei vértice construível para ${playerId}`);
}

/**
 * Remove todas as construções em volta de um hexágono, devolvendo as peças.
 * Cenários de produção precisam controlar exatamente quem é beneficiário — o
 * setup espalha assentamentos e contamina o teste sem isso.
 */
export function clearBuildingsOnHex(state: GameState, hexId: HexId): GameState {
  return produce(state, (draft) => {
    for (const vertexId of draft.board.hexes[hexId]!.vertices) {
      const building = draft.buildings[vertexId];
      if (building === undefined) continue;
      const player = draft.players.find((p) => p.id === building.owner)!;
      if (building.type === 'city') player.piecesLeft.cities += 1;
      else player.piecesLeft.settlements += 1;
      delete draft.buildings[vertexId];
    }
  });
}

/** Move o Saqueador para um hexágono que não produza o recurso em teste. */
export function moveRobberAway(state: GameState, awayFrom: HexId): GameState {
  const target = state.board.hexOrder.find((h) => h !== awayFrom);
  return produce(state, (draft) => {
    draft.robberHex = target as HexId;
  });
}
