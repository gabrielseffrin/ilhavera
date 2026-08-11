/**
 * Construção no turno principal — custos (§3.1), regra de distância (§3.2) e
 * conectividade (§4.3).
 */
import { describe, expect, it } from 'vitest';

import { COSTS } from '../src/types.js';
import { apply, clearHand, completeSetup, expectError, grant, newGame, patch } from './helpers/setup.js';
import { buildTrail, findBuildableSpot, placeBuilding, placeRoads } from './helpers/board.js';
import type { GameState } from '../src/state.js';

/** Coloca a partida na fase principal, com a vez da Ana e a mão vazia. */
function faseMain(): GameState {
  let s = completeSetup(newGame());
  s = patch(s, (draft) => {
    draft.phase = 'main';
  });
  return clearHand(s, 'ana');
}

/** Um vértice livre conectado a uma estrada da Ana. */
function vertexConectado(s: GameState): { state: GameState; vertexId: string } {
  return findBuildableSpot(s, 'ana');
}

describe('construir estrada', () => {
  it('cobra 1 madeira + 1 tijolo e devolve ao banco', () => {
    let s = faseMain();
    s = grant(s, 'ana', { lumber: 1, brick: 1 });

    const meuVertice = Object.entries(s.buildings).find(([, b]) => b.owner === 'ana')![0];
    const edgeId = s.board.vertices[meuVertice]!.edges.find((e) => s.roads[e] === undefined)!;

    const bancoAntes = { ...s.bank };
    const depois = apply(s, { type: 'placeRoad', player: 'ana', edgeId });

    expect(depois.roads[edgeId]!.owner).toBe('ana');
    expect(depois.players.find((p) => p.id === 'ana')!.resources.lumber).toBe(0);
    expect(depois.players.find((p) => p.id === 'ana')!.resources.brick).toBe(0);
    expect(depois.bank.lumber).toBe(bancoAntes.lumber + 1);
    expect(depois.bank.brick).toBe(bancoAntes.brick + 1);
    expect(depois.players.find((p) => p.id === 'ana')!.piecesLeft.roads).toBe(12);
  });

  it('recusa sem recursos', () => {
    const s = faseMain();
    const meuVertice = Object.entries(s.buildings).find(([, b]) => b.owner === 'ana')![0];
    const edgeId = s.board.vertices[meuVertice]!.edges.find((e) => s.roads[e] === undefined)!;
    expectError(s, { type: 'placeRoad', player: 'ana', edgeId }, 'INSUFFICIENT_RESOURCES');
  });

  it('recusa aresta já ocupada', () => {
    const s = grant(faseMain(), 'ana', { lumber: 1, brick: 1 });
    const ocupada = Object.keys(s.roads)[0]!;
    expectError(s, { type: 'placeRoad', player: 'ana', edgeId: ocupada }, 'EDGE_OCCUPIED');
  });

  it('recusa estrada desconectada da própria rede', () => {
    const s = grant(faseMain(), 'ana', { lumber: 1, brick: 1 });
    const solta = s.board.edgeOrder.find((e) => {
      if (s.roads[e] !== undefined) return false;
      return s.board.edges[e]!.vertices.every(
        (v) =>
          s.buildings[v] === undefined &&
          s.board.vertices[v]!.edges.every((x) => s.roads[x] === undefined),
      );
    })!;
    expectError(s, { type: 'placeRoad', player: 'ana', edgeId: solta }, 'ROAD_NOT_CONNECTED');
  });

  it('não deixa passar através de assentamento adversário', () => {
    let s = faseMain();
    // Trilha a partir de uma construção da Ana; o adversário ocupa o vértice
    // do meio, cortando a continuação.
    const meuVertice = Object.entries(s.buildings).find(([, b]) => b.owner === 'ana')![0];
    const trilha = buildTrail(s, meuVertice, 2);
    const meio = trilha.vertices[1]!;
    const segunda = trilha.edges[1]!;

    s = placeRoads(s, 'ana', [trilha.edges[0]!].filter((e) => s.roads[e] === undefined));
    if (s.roads[segunda] !== undefined) return; // aresta já usada pelo setup

    // Sem adversário no meio, a segunda estrada é legal.
    const semBloqueio = grant(s, 'ana', { lumber: 1, brick: 1 });
    expect(
      apply(semBloqueio, { type: 'placeRoad', player: 'ana', edgeId: segunda }).roads[segunda],
    ).toBeDefined();

    // Com adversário no meio, deixa de ser.
    if (s.buildings[meio] === undefined) {
      const bloqueado = grant(placeBuilding(s, 'bruno', meio, 'settlement'), 'ana', {
        lumber: 1,
        brick: 1,
      });
      expectError(
        bloqueado,
        { type: 'placeRoad', player: 'ana', edgeId: segunda },
        'ROAD_NOT_CONNECTED',
      );
    }
  });

  it('recusa quando acabaram as peças de estrada', () => {
    let s = grant(faseMain(), 'ana', { lumber: 1, brick: 1 });
    s = patch(s, (draft) => {
      draft.players.find((p) => p.id === 'ana')!.piecesLeft.roads = 0;
    });
    const meuVertice = Object.entries(s.buildings).find(([, b]) => b.owner === 'ana')![0];
    const edgeId = s.board.vertices[meuVertice]!.edges.find((e) => s.roads[e] === undefined)!;
    expectError(s, { type: 'placeRoad', player: 'ana', edgeId }, 'NO_PIECES_LEFT');
  });
});

describe('construir assentamento', () => {
  it('cobra o custo completo e exige conexão com estrada própria', () => {
    const { state, vertexId } = vertexConectado(faseMain());
    const s = grant(state, 'ana', COSTS.settlement);

    const depois = apply(s, { type: 'placeSettlement', player: 'ana', vertexId });
    expect(depois.buildings[vertexId]).toEqual({ owner: 'ana', type: 'settlement' });
    expect(depois.players.find((p) => p.id === 'ana')!.resources).toEqual({
      lumber: 0,
      brick: 0,
      wool: 0,
      grain: 0,
      ore: 0,
    });
  });

  it('recusa vértice sem estrada própria', () => {
    const s = grant(faseMain(), 'ana', COSTS.settlement);
    const solto = s.board.vertexOrder.find(
      (v) =>
        s.buildings[v] === undefined &&
        s.board.vertices[v]!.adjacentVertices.every((n) => s.buildings[n] === undefined) &&
        s.board.vertices[v]!.edges.every((e) => s.roads[e] === undefined),
    )!;
    expectError(
      s,
      { type: 'placeSettlement', player: 'ana', vertexId: solto },
      'SETTLEMENT_NOT_CONNECTED',
    );
  });

  it('aplica a regra de distância fora do setup', () => {
    const { state, vertexId } = vertexConectado(faseMain());
    let s = grant(state, 'ana', COSTS.settlement);
    // Ocupa um vizinho e o vértice deixa de ser legal.
    const vizinho = s.board.vertices[vertexId]!.adjacentVertices[0]!;
    s = placeBuilding(s, 'carla', vizinho, 'settlement');
    expectError(
      s,
      { type: 'placeSettlement', player: 'ana', vertexId },
      'DISTANCE_RULE_VIOLATION',
    );
  });

  it('recusa sem recursos', () => {
    const { state, vertexId } = vertexConectado(faseMain());
    expectError(
      state,
      { type: 'placeSettlement', player: 'ana', vertexId },
      'INSUFFICIENT_RESOURCES',
    );
  });

  it('recusa quando acabaram as peças', () => {
    const { state, vertexId } = vertexConectado(faseMain());
    let s = grant(state, 'ana', COSTS.settlement);
    s = patch(s, (draft) => {
      draft.players.find((p) => p.id === 'ana')!.piecesLeft.settlements = 0;
    });
    expectError(s, { type: 'placeSettlement', player: 'ana', vertexId }, 'NO_PIECES_LEFT');
  });
});

describe('construir cidade', () => {
  it('cobra 2 trigo + 3 minério e devolve o assentamento ao estoque', () => {
    const s = grant(faseMain(), 'ana', COSTS.city);
    const vertexId = Object.entries(s.buildings).find(([, b]) => b.owner === 'ana')![0];

    const antes = s.players.find((p) => p.id === 'ana')!.piecesLeft;
    const depois = apply(s, { type: 'buildCity', player: 'ana', vertexId });
    const peças = depois.players.find((p) => p.id === 'ana')!.piecesLeft;

    expect(depois.buildings[vertexId]).toEqual({ owner: 'ana', type: 'city' });
    expect(peças.cities).toBe(antes.cities - 1);
    // O assentamento volta para o estoque.
    expect(peças.settlements).toBe(antes.settlements + 1);
    expect(depois.bank.grain).toBeGreaterThan(s.bank.grain);
  });

  it('recusa cidade em vértice vazio ou de adversário', () => {
    const s = grant(faseMain(), 'ana', COSTS.city);
    const vazio = s.board.vertexOrder.find((v) => s.buildings[v] === undefined)!;
    expectError(s, { type: 'buildCity', player: 'ana', vertexId: vazio }, 'NOT_YOUR_SETTLEMENT');

    const alheio = Object.entries(s.buildings).find(([, b]) => b.owner !== 'ana')![0];
    expectError(s, { type: 'buildCity', player: 'ana', vertexId: alheio }, 'NOT_YOUR_SETTLEMENT');
  });

  it('recusa transformar cidade em cidade', () => {
    let s = grant(faseMain(), 'ana', COSTS.city);
    const vertexId = Object.entries(s.buildings).find(([, b]) => b.owner === 'ana')![0];
    s = apply(s, { type: 'buildCity', player: 'ana', vertexId });
    s = grant(s, 'ana', COSTS.city);
    expectError(s, { type: 'buildCity', player: 'ana', vertexId }, 'ALREADY_CITY');
  });

  it('recusa quando acabaram as cidades', () => {
    let s = grant(faseMain(), 'ana', COSTS.city);
    s = patch(s, (draft) => {
      draft.players.find((p) => p.id === 'ana')!.piecesLeft.cities = 0;
    });
    const vertexId = Object.entries(s.buildings).find(([, b]) => b.owner === 'ana')![0];
    expectError(s, { type: 'buildCity', player: 'ana', vertexId }, 'NO_PIECES_LEFT');
  });
});
