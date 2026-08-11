/**
 * Bônus e vitória — §3.4 do roadmap.
 *
 * Os dois casos que §8 destaca estão aqui: Estrada Mais Longa quebrada por
 * assentamento adversário, e empate no desempate deixando o bônus sem dono.
 */
import { describe, expect, it } from 'vitest';

import { longestRoadLength, recomputeLongestRoad } from '../src/scoring/longestRoad.js';
import { recomputeLargestArmy, victoryPoints } from '../src/scoring/victory.js';
import {
  apply,
  clearHand,
  completeSetup,
  expectError,
  giveDevCard,
  newGame,
  patch,
} from './helpers/setup.js';
import { buildTrail, placeBuilding, placeRoads } from './helpers/board.js';
import type { GameState } from '../src/state.js';

function tabuleiroLimpo(): GameState {
  let s = completeSetup(newGame());
  s = patch(s, (draft) => {
    draft.phase = 'main';
    draft.buildings = {};
    draft.roads = {};
    for (const p of draft.players) {
      p.piecesLeft = { roads: 15, settlements: 5, cities: 4 };
    }
  });
  for (const p of s.players) s = clearHand(s, p.id);
  return s;
}

describe('Estrada Mais Longa: medição', () => {
  it('conta 0 sem estradas', () => {
    expect(longestRoadLength(tabuleiroLimpo(), 'ana')).toBe(0);
  });

  it('mede um trilho contínuo', () => {
    const s = tabuleiroLimpo();
    const inicio = s.board.vertexOrder[0]!;
    const trilha = buildTrail(s, inicio, 6);
    const comEstradas = placeRoads(s, 'ana', trilha.edges);
    expect(longestRoadLength(comEstradas, 'ana')).toBe(6);
  });

  it('ignora as estradas dos adversários', () => {
    const s = tabuleiroLimpo();
    const trilha = buildTrail(s, s.board.vertexOrder[0]!, 5);
    const comEstradas = placeRoads(s, 'ana', trilha.edges);
    expect(longestRoadLength(comEstradas, 'bruno')).toBe(0);
  });

  it('permite repetir vértice, mas não aresta (é trilho, não caminho)', () => {
    let s = tabuleiroLimpo();
    // Um hexágono inteiro é um ciclo de 6 arestas: passa 2x pelo vértice
    // inicial e mede 6.
    const hexId = s.board.hexOrder[9]!;
    const cantos = s.board.hexes[hexId]!.vertices;
    const anel: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = cantos[i]!;
      const b = cantos[(i + 1) % 6]!;
      anel.push(s.board.vertices[a]!.edges.find((e) => s.board.edges[e]!.vertices.includes(b))!);
    }
    s = placeRoads(s, 'ana', anel);
    expect(longestRoadLength(s, 'ana')).toBe(6);
  });

  it('é interrompida por assentamento adversário no meio da rota', () => {
    let s = tabuleiroLimpo();
    const inicio = s.board.vertexOrder[0]!;
    const trilha = buildTrail(s, inicio, 6, { simple: true });
    s = placeRoads(s, 'ana', trilha.edges);
    expect(longestRoadLength(s, 'ana')).toBe(6);

    // Bruno se instala no meio: a rota vira 3 + 3.
    const meio = trilha.vertices[3]!;
    s = placeBuilding(s, 'bruno', meio, 'settlement');
    expect(longestRoadLength(s, 'ana')).toBe(3);
  });

  it('não é interrompida por construção própria', () => {
    let s = tabuleiroLimpo();
    const trilha = buildTrail(s, s.board.vertexOrder[0]!, 6, { simple: true });
    s = placeRoads(s, 'ana', trilha.edges);
    s = placeBuilding(s, 'ana', trilha.vertices[3]!, 'settlement');
    expect(longestRoadLength(s, 'ana')).toBe(6);
  });

  it('deixa a rota terminar num vértice bloqueado, sem atravessá-lo', () => {
    let s = tabuleiroLimpo();
    const trilha = buildTrail(s, s.board.vertexOrder[0]!, 4, { simple: true });
    s = placeRoads(s, 'ana', trilha.edges);
    // Adversário na PONTA: a rota inteira continua valendo.
    s = placeBuilding(s, 'bruno', trilha.vertices[4]!, 'settlement');
    expect(longestRoadLength(s, 'ana')).toBe(4);
  });

  it('num ciclo, cortar um vértice não parte a rota em dois', () => {
    // Consequência de a rota ser um trilho: sai-se do próprio vértice cortado
    // e percorre-se o resto do anel. Fácil de implementar errado.
    let s = tabuleiroLimpo();
    const hexId = s.board.hexOrder[9]!;
    const cantos = s.board.hexes[hexId]!.vertices;
    const anel: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = cantos[i]!;
      const b = cantos[(i + 1) % 6]!;
      anel.push(s.board.vertices[a]!.edges.find((e) => s.board.edges[e]!.vertices.includes(b))!);
    }
    s = placeRoads(s, 'ana', anel);
    s = placeBuilding(s, 'bruno', cantos[0]!, 'settlement');
    expect(longestRoadLength(s, 'ana')).toBe(5);
  });
});

describe('Estrada Mais Longa: posse do bônus', () => {
  it('só entrega o bônus a partir de 5 segmentos', () => {
    let s = tabuleiroLimpo();
    const trilha = buildTrail(s, s.board.vertexOrder[0]!, 4);
    s = placeRoads(s, 'ana', trilha.edges);
    expect(recomputeLongestRoad(s, { owner: null, length: 0 })).toEqual({
      owner: null,
      length: 0,
    });

    s = placeRoads(s, 'ana', buildTrail(s, trilha.vertices[4]!, 1).edges);
    expect(recomputeLongestRoad(s, { owner: null, length: 0 })).toEqual({
      owner: 'ana',
      length: 5,
    });
  });

  it('não transfere por empate — exige estritamente mais', () => {
    let s = tabuleiroLimpo();
    const anaTrilha = buildTrail(s, s.board.vertexOrder[0]!, 5);
    s = placeRoads(s, 'ana', anaTrilha.edges);

    const longe = s.board.vertexOrder.find(
      (v) => s.board.vertices[v]!.edges.every((e) => s.roads[e] === undefined),
    )!;
    const brunoTrilha = buildTrail(s, longe, 5);
    s = placeRoads(s, 'bruno', brunoTrilha.edges);

    expect(recomputeLongestRoad(s, { owner: 'ana', length: 5 })).toEqual({
      owner: 'ana',
      length: 5,
    });
  });

  it('transfere quando alguém supera estritamente', () => {
    let s = tabuleiroLimpo();
    s = placeRoads(s, 'ana', buildTrail(s, s.board.vertexOrder[0]!, 5).edges);

    const longe = s.board.vertexOrder.find(
      (v) => s.board.vertices[v]!.edges.every((e) => s.roads[e] === undefined),
    )!;
    s = placeRoads(s, 'bruno', buildTrail(s, longe, 6).edges);

    expect(recomputeLongestRoad(s, { owner: 'ana', length: 5 })).toEqual({
      owner: 'bruno',
      length: 6,
    });
  });

  it('deixa o bônus SEM DONO quando a rota do detentor é quebrada e há empate', () => {
    // Caso de borda explícito em §3.4 e catalogado em §8.
    let s = tabuleiroLimpo();

    // Ana com 7; Bruno e Carla com 5 cada.
    const anaTrilha = buildTrail(s, s.board.vertexOrder[0]!, 7);
    s = placeRoads(s, 'ana', anaTrilha.edges);

    const livre1 = s.board.vertexOrder.find(
      (v) => s.board.vertices[v]!.edges.every((e) => s.roads[e] === undefined),
    )!;
    s = placeRoads(s, 'bruno', buildTrail(s, livre1, 5).edges);

    const livre2 = s.board.vertexOrder.find(
      (v) =>
        s.board.vertices[v]!.edges.every((e) => s.roads[e] === undefined) &&
        s.board.vertices[v]!.adjacentVertices.every((n) =>
          s.board.vertices[n]!.edges.every((e) => s.roads[e] === undefined),
        ),
    )!;
    s = placeRoads(s, 'carla', buildTrail(s, livre2, 5).edges);

    expect(recomputeLongestRoad(s, { owner: null, length: 0 })).toEqual({
      owner: 'ana',
      length: 7,
    });

    // Davi quebra a rota da Ana bem no meio, derrubando-a para 3.
    s = placeBuilding(s, 'davi', anaTrilha.vertices[3]!, 'settlement');
    expect(longestRoadLength(s, 'ana')).toBeLessThan(5);

    // Bruno e Carla empatam em 5: ninguém fica com o bônus.
    expect(recomputeLongestRoad(s, { owner: 'ana', length: 7 })).toEqual({
      owner: null,
      length: 5,
    });
  });

  it('devolve o bônus quando alguém desempata depois', () => {
    let s = tabuleiroLimpo();
    s = placeRoads(s, 'bruno', buildTrail(s, s.board.vertexOrder[0]!, 5).edges);
    const livre = s.board.vertexOrder.find(
      (v) => s.board.vertices[v]!.edges.every((e) => s.roads[e] === undefined),
    )!;
    const carlaTrilha = buildTrail(s, livre, 5);
    s = placeRoads(s, 'carla', carlaTrilha.edges);

    expect(recomputeLongestRoad(s, { owner: null, length: 5 })).toEqual({
      owner: null,
      length: 5,
    });

    s = placeRoads(s, 'carla', buildTrail(s, carlaTrilha.vertices[5]!, 1).edges);
    expect(recomputeLongestRoad(s, { owner: null, length: 5 })).toEqual({
      owner: 'carla',
      length: 6,
    });
  });

  it('tira o bônus de todos se ninguém mais alcança o mínimo', () => {
    const s = tabuleiroLimpo();
    expect(recomputeLongestRoad(s, { owner: 'ana', length: 7 })).toEqual({
      owner: null,
      length: 0,
    });
  });
});

describe('Maior Exército', () => {
  it('só entrega a partir de 3 Soldados', () => {
    let s = tabuleiroLimpo();
    s = patch(s, (draft) => {
      draft.players.find((p) => p.id === 'ana')!.knightsPlayed = 2;
    });
    expect(recomputeLargestArmy(s, { owner: null, size: 0 })).toEqual({ owner: null, size: 0 });

    s = patch(s, (draft) => {
      draft.players.find((p) => p.id === 'ana')!.knightsPlayed = 3;
    });
    expect(recomputeLargestArmy(s, { owner: null, size: 0 })).toEqual({ owner: 'ana', size: 3 });
  });

  it('não transfere por empate', () => {
    const s = patch(tabuleiroLimpo(), (draft) => {
      draft.players.find((p) => p.id === 'ana')!.knightsPlayed = 3;
      draft.players.find((p) => p.id === 'bruno')!.knightsPlayed = 3;
    });
    expect(recomputeLargestArmy(s, { owner: 'ana', size: 3 })).toEqual({ owner: 'ana', size: 3 });
  });

  it('transfere com estritamente mais', () => {
    const s = patch(tabuleiroLimpo(), (draft) => {
      draft.players.find((p) => p.id === 'ana')!.knightsPlayed = 3;
      draft.players.find((p) => p.id === 'bruno')!.knightsPlayed = 4;
    });
    expect(recomputeLargestArmy(s, { owner: 'ana', size: 3 })).toEqual({ owner: 'bruno', size: 4 });
  });

  it('é atualizado pelo reducer ao jogar o 3º Soldado', () => {
    let s = patch(tabuleiroLimpo(), (draft) => {
      draft.turnNumber = 5;
      draft.players.find((p) => p.id === 'ana')!.knightsPlayed = 2;
    });
    s = giveDevCard(s, 'ana', 'knight');

    s = apply(s, { type: 'playKnight', player: 'ana' });
    expect(s.largestArmy).toEqual({ owner: 'ana', size: 3 });
  });
});

describe('pontos de vitória', () => {
  it('soma assentamentos, cidades, bônus e cartas', () => {
    let s = tabuleiroLimpo();
    const v = s.board.vertexOrder;
    s = placeBuilding(s, 'ana', v[0]!, 'settlement');
    s = placeBuilding(s, 'ana', v[10]!, 'city');
    s = patch(s, (draft) => {
      draft.largestArmy = { owner: 'ana', size: 3 };
      draft.longestRoad = { owner: 'ana', length: 5 };
    });
    s = giveDevCard(s, 'ana', 'victoryPoint');

    const pv = victoryPoints(s, 'ana', true);
    expect(pv).toMatchObject({
      settlements: 1,
      cities: 2,
      largestArmy: 2,
      longestRoad: 2,
      devCards: 1,
      total: 8,
    });
  });

  it('esconde as cartas de PV da pontuação pública', () => {
    let s = giveDevCard(tabuleiroLimpo(), 'ana', 'victoryPoint');
    s = giveDevCard(s, 'ana', 'victoryPoint');
    expect(victoryPoints(s, 'ana', true).total).toBe(2);
    expect(victoryPoints(s, 'ana', false).total).toBe(0);
  });
});

describe('vitória', () => {
  it('encerra a partida ao alcançar o alvo no próprio turno', () => {
    let s = tabuleiroLimpo();
    s = patch(s, (draft) => {
      draft.turnNumber = 5;
      draft.players.find((p) => p.id === 'ana')!.knightsPlayed = 2;
      draft.largestArmy = { owner: null, size: 0 };
      draft.longestRoad = { owner: 'ana', length: 6 };
    });
    // 3 cidades (6) + estrada mais longa (2) = 8; o 3º Soldado traz +2.
    const v = s.board.vertexOrder;
    s = placeBuilding(s, 'ana', v[0]!, 'city');
    s = placeBuilding(s, 'ana', v[10]!, 'city');
    s = placeBuilding(s, 'ana', v[20]!, 'city');
    s = giveDevCard(s, 'ana', 'knight');

    expect(victoryPoints(s, 'ana', true).total).toBe(8);

    s = apply(s, { type: 'playKnight', player: 'ana' });

    expect(s.winner).toBe('ana');
    expect(s.phase).toBe('finished');
    expect(s.log.at(-1)!.type).toBe('gameWon');
  });

  it('vence por carta de PV oculta', () => {
    // Caso de borda de §8: a vitória chega por informação que ninguém via.
    let s = tabuleiroLimpo();
    const v = s.board.vertexOrder;
    s = placeBuilding(s, 'ana', v[0]!, 'city');
    s = placeBuilding(s, 'ana', v[10]!, 'city');
    s = placeBuilding(s, 'ana', v[20]!, 'city');
    s = placeBuilding(s, 'ana', v[30]!, 'city');
    s = patch(s, (draft) => {
      draft.turnNumber = 5;
    });
    for (let i = 0; i < 2; i++) s = giveDevCard(s, 'ana', 'victoryPoint');

    // Publicamente são 8 pontos; de verdade, 10.
    expect(victoryPoints(s, 'ana', false).total).toBe(8);
    expect(victoryPoints(s, 'ana', true).total).toBe(10);

    // A vitória é reconhecida na próxima ação da Ana.
    s = giveDevCard(s, 'ana', 'monopoly');
    s = apply(s, { type: 'playMonopoly', player: 'ana', resource: 'ore' });
    expect(s.winner).toBe('ana');
  });

  it('não declara vitória no turno alheio', () => {
    let s = tabuleiroLimpo();
    const v = s.board.vertexOrder;
    // Bruno tem 10 PV, mas é a vez da Ana.
    for (const idx of [0, 10, 20, 30, 40]) {
      s = placeBuilding(s, 'bruno', v[idx]!, 'city');
    }
    s = patch(s, (draft) => {
      draft.turnNumber = 5;
    });
    expect(victoryPoints(s, 'bruno', true).total).toBe(10);

    s = apply(s, { type: 'endTurn', player: 'ana' });
    // Agora é a vez do Bruno: a vitória é reconhecida.
    expect(s.players[s.currentPlayerIndex]!.id).toBe('bruno');
    expect(s.winner).toBe('bruno');
  });

  it('rejeita qualquer ação depois do fim', () => {
    let s = tabuleiroLimpo();
    s = patch(s, (draft) => {
      draft.phase = 'finished';
      draft.winner = 'ana';
    });
    expectError(s, { type: 'endTurn', player: 'ana' }, 'GAME_FINISHED');
  });
});
