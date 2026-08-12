/**
 * Fase de preparação — §3.2 do roadmap.
 */
import { describe, expect, it } from 'vitest';

import { createGame } from '../src/game.js';
import { enumerateLegalActions } from '../src/legal.js';
import { countResources } from '../src/query.js';
import { apply, completeSetup, expectError, newGame } from './helpers/setup.js';
import { hexVertices } from './helpers/board.js';

describe('criação de partida', () => {
  it('começa em setup1 com o Saqueador no deserto', () => {
    const s = newGame();
    expect(s.phase).toBe('setup1');
    expect(s.setupStep).toBe('settlement');
    expect(s.board.hexes[s.robberHex]!.terrain).toBe('desert');
    expect(s.turnNumber).toBe(0);
  });

  it('começa com o banco cheio e o baralho de 25 cartas embaralhado', () => {
    const s = newGame();
    expect(s.bank).toEqual({ lumber: 19, brick: 19, wool: 19, grain: 19, ore: 19 });
    expect(s.devDeck).toHaveLength(25);
    expect(s.devDeck.filter((c) => c === 'knight')).toHaveLength(14);
    expect(s.devDeck.filter((c) => c === 'victoryPoint')).toHaveLength(5);
    expect(s.devDeck.filter((c) => c === 'monopoly')).toHaveLength(2);
  });

  it('dá a cada jogador 15 estradas, 5 assentamentos e 4 cidades', () => {
    for (const p of newGame().players) {
      expect(p.piecesLeft).toEqual({ roads: 15, settlements: 5, cities: 4 });
    }
  });

  it('sorteia a ordem dos assentos a partir da seed', () => {
    const opcoes = {
      id: 'x',
      seed: 'ordem-especifica',
      players: [
        { id: 'ana', name: 'Ana', color: 'red' as const },
        { id: 'bruno', name: 'Bruno', color: 'blue' as const },
        { id: 'carla', name: 'Carla', color: 'white' as const },
        { id: 'davi', name: 'Davi', color: 'orange' as const },
      ],
    };
    const a = createGame(opcoes).players.map((p) => p.id);
    const b = createGame(opcoes).players.map((p) => p.id);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(['ana', 'bruno', 'carla', 'davi']);
  });

  it('recusa mesa fora de 3 a 4 jogadores', () => {
    const base = {
      id: 'x',
      seed: 's',
      players: [
        { id: 'a', name: 'A', color: 'red' as const },
        { id: 'b', name: 'B', color: 'blue' as const },
      ],
    };
    expect(() => createGame(base)).toThrow(/entre 3 e 4/);
  });

  it('recusa IDs ou cores duplicados', () => {
    expect(() =>
      createGame({
        id: 'x',
        seed: 's',
        players: [
          { id: 'a', name: 'A', color: 'red' },
          { id: 'a', name: 'B', color: 'blue' },
          { id: 'c', name: 'C', color: 'white' },
        ],
      }),
    ).toThrow(/duplicados/);

    expect(() =>
      createGame({
        id: 'x',
        seed: 's',
        players: [
          { id: 'a', name: 'A', color: 'red' },
          { id: 'b', name: 'B', color: 'red' },
          { id: 'c', name: 'C', color: 'white' },
        ],
      }),
    ).toThrow(/cores/);
  });
});

describe('ordem do setup', () => {
  it('percorre a rodada 1 na ordem normal e a rodada 2 na inversa', () => {
    let s = newGame();
    const ordem: string[] = [];

    let guard = 0;
    while (s.phase === 'setup1' || s.phase === 'setup2') {
      if (guard++ > 100) throw new Error('setup não terminou');
      const jogador = s.players[s.currentPlayerIndex]!.id;
      if (s.setupStep === 'settlement') ordem.push(jogador);
      s = apply(s, enumerateLegalActions(s, jogador)[0]!);
    }

    expect(ordem).toEqual([
      'ana',
      'bruno',
      'carla',
      'davi', // rodada 1
      'davi',
      'carla',
      'bruno',
      'ana', // rodada 2, ordem inversa
    ]);
  });

  it('termina o setup em awaitingRoll com o primeiro jogador e turno 1', () => {
    const s = completeSetup(newGame());
    expect(s.phase).toBe('awaitingRoll');
    expect(s.currentPlayerIndex).toBe(0);
    expect(s.players[0]!.id).toBe('ana');
    expect(s.turnNumber).toBe(1);
  });

  it('coloca 2 assentamentos e 2 estradas por jogador', () => {
    const s = completeSetup(newGame());
    expect(Object.keys(s.buildings)).toHaveLength(8);
    expect(Object.keys(s.roads)).toHaveLength(8);
    for (const p of s.players) {
      expect(p.piecesLeft.settlements).toBe(3);
      expect(p.piecesLeft.roads).toBe(13);
    }
  });

  it('exige assentamento antes de estrada', () => {
    const s = newGame();
    const edge = s.board.edgeOrder[0]!;
    expectError(s, { type: 'placeRoad', player: 'ana', edgeId: edge }, 'INVALID_PHASE');
  });

  it('exige que a estrada do setup encoste no assentamento recém-colocado', () => {
    let s = newGame();
    const vertexId = s.board.vertexOrder[0]!;
    s = apply(s, { type: 'placeSettlement', player: 'ana', vertexId });

    const longe = s.board.edgeOrder.find((e) => !s.board.edges[e]!.vertices.includes(vertexId))!;
    expectError(s, { type: 'placeRoad', player: 'ana', edgeId: longe }, 'ROAD_NOT_CONNECTED');

    const perto = s.board.vertices[vertexId]!.edges[0]!;
    s = apply(s, { type: 'placeRoad', player: 'ana', edgeId: perto });
    expect(s.roads[perto]!.owner).toBe('ana');
  });

  it('aplica a regra de distância já no setup', () => {
    let s = newGame();
    const vertexId = s.board.vertexOrder[0]!;
    s = apply(s, { type: 'placeSettlement', player: 'ana', vertexId });
    s = apply(s, {
      type: 'placeRoad',
      player: 'ana',
      edgeId: s.board.vertices[vertexId]!.edges[0]!,
    });

    const vizinho = s.board.vertices[vertexId]!.adjacentVertices[0]!;
    expectError(
      s,
      { type: 'placeSettlement', player: 'bruno', vertexId: vizinho },
      'DISTANCE_RULE_VIOLATION',
    );
    expectError(s, { type: 'placeSettlement', player: 'bruno', vertexId }, 'VERTEX_OCCUPIED');
  });

  it('rejeita jogador fora da vez', () => {
    const s = newGame();
    expectError(
      s,
      { type: 'placeSettlement', player: 'bruno', vertexId: s.board.vertexOrder[0]! },
      'NOT_YOUR_TURN',
    );
  });

  it('rejeita vértice inexistente', () => {
    const s = newGame();
    expectError(
      s,
      { type: 'placeSettlement', player: 'ana', vertexId: 'nao-existe' },
      'VERTEX_NOT_FOUND',
    );
  });

  it('não produz recursos na rodada 1', () => {
    let s = newGame();
    const vertexId = s.board.vertexOrder[0]!;
    s = apply(s, { type: 'placeSettlement', player: 'ana', vertexId });
    expect(countResources(s.players[0]!.resources)).toBe(0);
  });

  it('produz 1 recurso por hexágono produtivo adjacente no 2º assentamento', () => {
    // Roda o setup inteiro e confere o jogador que abriu a rodada 2.
    let s = newGame();
    let segundoAssentamentoDe: string | null = null;
    let recursosAntes = 0;

    let guard = 0;
    while (s.phase === 'setup1' || s.phase === 'setup2') {
      if (guard++ > 100) throw new Error('setup não terminou');
      const jogador = s.players[s.currentPlayerIndex]!.id;
      const fase = s.phase;
      const passo = s.setupStep;

      if (fase === 'setup2' && passo === 'settlement' && segundoAssentamentoDe === null) {
        segundoAssentamentoDe = jogador;
        recursosAntes = countResources(s.players.find((p) => p.id === jogador)!.resources);
      }

      s = apply(s, enumerateLegalActions(s, jogador)[0]!);

      if (fase === 'setup2' && passo === 'settlement' && segundoAssentamentoDe === jogador) {
        const jogadorEstado = s.players.find((p) => p.id === jogador)!;
        const ganho = countResources(jogadorEstado.resources) - recursosAntes;
        const vertexId = s.lastSetupVertex!;
        const produtivos = s.board.vertices[vertexId]!.hexes.filter(
          (h) => s.board.hexes[h]!.terrain !== 'desert',
        ).length;
        expect(ganho).toBe(produtivos);
        break;
      }
    }

    expect(segundoAssentamentoDe).not.toBeNull();
  });

  it('debita o banco na produção do 2º assentamento', () => {
    const s = completeSetup(newGame());
    const totalNasMaos = s.players.reduce((sum, p) => sum + countResources(p.resources), 0);
    const totalNoBanco = countResources(s.bank);
    expect(totalNasMaos + totalNoBanco).toBe(95);
    expect(totalNasMaos).toBeGreaterThan(0);
  });

  it('não deixa rolar dados durante o setup', () => {
    const s = newGame();
    expectError(s, { type: 'rollDice', player: 'ana' }, 'INVALID_PHASE');
  });

  it('não deixa construir cidade durante o setup', () => {
    const s = newGame();
    const vertexId = hexVertices(s, s.board.hexOrder[0]!)[0]!;
    expectError(s, { type: 'buildCity', player: 'ana', vertexId }, 'INVALID_PHASE');
  });
});
