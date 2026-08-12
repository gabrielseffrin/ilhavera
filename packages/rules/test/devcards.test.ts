/**
 * Cartas de Progresso — §3.1 e §3.3. Cobre os casos de §8: carta comprada e
 * tentada no mesmo turno, Monopólio quando ninguém tem o recurso, e a cota de
 * 1 carta por turno.
 */
import { describe, expect, it } from 'vitest';

import { COSTS } from '../src/types.js';
import {
  apply,
  clearHand,
  completeSetup,
  expectError,
  giveDevCard,
  grant,
  newGame,
  patch,
  stackDeck,
} from './helpers/setup.js';
import type { GameState } from '../src/state.js';

function faseMain(): GameState {
  let s = completeSetup(newGame());
  s = patch(s, (draft) => {
    draft.phase = 'main';
    // Turno alto: cartas "compradas no turno 0" já são jogáveis.
    draft.turnNumber = 5;
  });
  for (const p of s.players) s = clearHand(s, p.id);
  return s;
}

describe('comprar Carta de Progresso', () => {
  it('cobra 1 lã + 1 trigo + 1 minério e tira do baralho', () => {
    let s = grant(faseMain(), 'ana', COSTS.devCard);
    const baralhoAntes = s.devDeck.length;

    s = apply(s, { type: 'buyDevCard', player: 'ana' });

    expect(s.devDeck.length).toBe(baralhoAntes - 1);
    expect(s.players.find((p) => p.id === 'ana')!.devCards).toHaveLength(1);
    expect(s.players.find((p) => p.id === 'ana')!.resources).toEqual({
      lumber: 0,
      brick: 0,
      wool: 0,
      grain: 0,
      ore: 0,
    });
    expect(s.bank.wool).toBeGreaterThan(0);
  });

  it('registra o turno da compra', () => {
    let s = grant(faseMain(), 'ana', COSTS.devCard);
    s = apply(s, { type: 'buyDevCard', player: 'ana' });
    expect(s.players.find((p) => p.id === 'ana')!.devCards[0]!.boughtOnTurn).toBe(5);
  });

  it('recusa sem recursos', () => {
    expectError(faseMain(), { type: 'buyDevCard', player: 'ana' }, 'INSUFFICIENT_RESOURCES');
  });

  it('recusa com o baralho vazio', () => {
    let s = grant(faseMain(), 'ana', COSTS.devCard);
    s = patch(s, (draft) => {
      draft.devDeck = [];
    });
    expectError(s, { type: 'buyDevCard', player: 'ana' }, 'DEV_DECK_EMPTY');
  });
});

describe('restrições de uso', () => {
  it('não deixa jogar carta comprada no mesmo turno', () => {
    let s = grant(faseMain(), 'ana', COSTS.devCard);
    s = stackDeck(s, 'knight');
    s = apply(s, { type: 'buyDevCard', player: 'ana' });
    expectError(s, { type: 'playKnight', player: 'ana' }, 'DEV_CARD_BOUGHT_THIS_TURN');
  });

  it('libera a carta no turno seguinte', () => {
    let s = grant(faseMain(), 'ana', COSTS.devCard);
    s = stackDeck(s, 'knight');
    s = apply(s, { type: 'buyDevCard', player: 'ana' });
    s = patch(s, (draft) => {
      draft.turnNumber += 1;
      draft.devCardPlayedThisTurn = false;
    });
    s = apply(s, { type: 'playKnight', player: 'ana' });
    expect(s.phase).toBe('movingRobber');
  });

  it('permite no máximo 1 carta por turno', () => {
    let s = giveDevCard(faseMain(), 'ana', 'monopoly');
    s = giveDevCard(s, 'ana', 'yearOfPlenty');

    s = apply(s, { type: 'playMonopoly', player: 'ana', resource: 'ore' });
    expect(s.devCardPlayedThisTurn).toBe(true);
    expectError(
      s,
      { type: 'playYearOfPlenty', player: 'ana', resources: ['ore', 'wool'] },
      'DEV_CARD_ALREADY_PLAYED',
    );
  });

  it('recusa jogar carta que o jogador não tem', () => {
    expectError(faseMain(), { type: 'playKnight', player: 'ana' }, 'DEV_CARD_NOT_OWNED');
  });

  it('nunca deixa "jogar" uma carta de Ponto de Vitória', () => {
    // Não existe ação para isso no vocabulário do motor — a carta só conta no
    // fim. O teste garante que ela também não some da contagem de PV.
    const s = giveDevCard(faseMain(), 'ana', 'victoryPoint');
    expect(s.players.find((p) => p.id === 'ana')!.devCards[0]!.card).toBe('victoryPoint');
  });
});

describe('Soldado', () => {
  it('move o Saqueador e conta para o Maior Exército', () => {
    let s = giveDevCard(faseMain(), 'ana', 'knight');
    s = apply(s, { type: 'playKnight', player: 'ana' });

    expect(s.phase).toBe('movingRobber');
    expect(s.players.find((p) => p.id === 'ana')!.knightsPlayed).toBe(1);
    expect(s.robberReturnPhase).toBe('main');
  });

  it('jogado ANTES da rolagem devolve para awaitingRoll', () => {
    let s = giveDevCard(faseMain(), 'ana', 'knight');
    s = patch(s, (draft) => {
      draft.phase = 'awaitingRoll';
    });

    s = apply(s, { type: 'playKnight', player: 'ana' });
    expect(s.phase).toBe('movingRobber');
    expect(s.robberReturnPhase).toBe('awaitingRoll');

    const destino = s.board.hexOrder.find(
      (h) =>
        h !== s.robberHex && s.board.hexes[h]!.vertices.every((v) => s.buildings[v] === undefined),
    )!;
    s = apply(s, { type: 'moveRobber', player: 'ana', hexId: destino, stealFrom: null });

    // A rolagem continua obrigatória.
    expect(s.phase).toBe('awaitingRoll');
  });
});

describe('Construção de Estradas', () => {
  it('dá 2 estradas grátis', () => {
    let s = giveDevCard(faseMain(), 'ana', 'roadBuilding');
    s = apply(s, { type: 'playRoadBuilding', player: 'ana' });
    expect(s.freeRoadsRemaining).toBe(2);

    const meuVertice = Object.entries(s.buildings).find(([, b]) => b.owner === 'ana')![0];
    const edgeId = s.board.vertices[meuVertice]!.edges.find((e) => s.roads[e] === undefined)!;

    // Sem nenhum recurso na mão, a estrada sai.
    s = apply(s, { type: 'placeRoad', player: 'ana', edgeId });
    expect(s.roads[edgeId]!.owner).toBe('ana');
    expect(s.freeRoadsRemaining).toBe(1);
    expect(s.players.find((p) => p.id === 'ana')!.resources.lumber).toBe(0);
  });

  it('não dá mais estradas grátis que peças no estoque', () => {
    let s = giveDevCard(faseMain(), 'ana', 'roadBuilding');
    s = patch(s, (draft) => {
      draft.players.find((p) => p.id === 'ana')!.piecesLeft.roads = 1;
    });
    s = apply(s, { type: 'playRoadBuilding', player: 'ana' });
    expect(s.freeRoadsRemaining).toBe(1);
  });

  it('perde as estradas grátis não usadas ao encerrar o turno', () => {
    let s = giveDevCard(faseMain(), 'ana', 'roadBuilding');
    s = apply(s, { type: 'playRoadBuilding', player: 'ana' });
    s = apply(s, { type: 'endTurn', player: 'ana' });
    expect(s.freeRoadsRemaining).toBe(0);
    expect(s.devCardPlayedThisTurn).toBe(false);
  });
});

describe('Descoberta', () => {
  it('pega 2 recursos quaisquer do banco', () => {
    let s = giveDevCard(faseMain(), 'ana', 'yearOfPlenty');
    const bancoAntes = { ...s.bank };

    s = apply(s, { type: 'playYearOfPlenty', player: 'ana', resources: ['ore', 'wool'] });

    const ana = s.players.find((p) => p.id === 'ana')!;
    expect(ana.resources.ore).toBe(1);
    expect(ana.resources.wool).toBe(1);
    expect(s.bank.ore).toBe(bancoAntes.ore - 1);
    expect(s.bank.wool).toBe(bancoAntes.wool - 1);
  });

  it('aceita dois do mesmo recurso', () => {
    let s = giveDevCard(faseMain(), 'ana', 'yearOfPlenty');
    s = apply(s, { type: 'playYearOfPlenty', player: 'ana', resources: ['grain', 'grain'] });
    expect(s.players.find((p) => p.id === 'ana')!.resources.grain).toBe(2);
  });

  it('recusa quando o banco não tem as duas cartas', () => {
    let s = giveDevCard(faseMain(), 'ana', 'yearOfPlenty');
    s = patch(s, (draft) => {
      draft.players.find((p) => p.id === 'bruno')!.resources.ore += draft.bank.ore - 1;
      draft.bank.ore = 1;
    });
    expectError(
      s,
      { type: 'playYearOfPlenty', player: 'ana', resources: ['ore', 'ore'] },
      'BANK_DEPLETED',
    );
    // Uma só continua possível.
    const ok = apply(s, { type: 'playYearOfPlenty', player: 'ana', resources: ['ore', 'wool'] });
    expect(ok.bank.ore).toBe(0);
  });
});

describe('interações entre fases', () => {
  /** Avança o cursor do PRNG até a rolagem dar 7, e rola. */
  function forcarSete(state: GameState, jogador: string): GameState {
    for (let offset = 0; offset < 500; offset++) {
      const tentativa = patch(state, (draft) => {
        draft.rngCursor = state.rngCursor + offset;
      });
      const depois = apply(tentativa, { type: 'rollDice', player: jogador });
      if (depois.lastRoll!.total === 7) return depois;
    }
    throw new Error('não encontrei rolagem 7');
  }

  it('Soldado antes da rolagem: move o Saqueador, volta a aguardar a rolagem e o 7 abre outra fase de Saqueador', () => {
    let s = giveDevCard(faseMain(), 'ana', 'knight');
    s = patch(s, (draft) => {
      draft.phase = 'awaitingRoll';
    });

    s = apply(s, { type: 'playKnight', player: 'ana' });
    const primeiroDestino = s.board.hexOrder.find(
      (h) =>
        h !== s.robberHex && s.board.hexes[h]!.vertices.every((v) => s.buildings[v] === undefined),
    )!;
    s = apply(s, { type: 'moveRobber', player: 'ana', hexId: primeiroDestino, stealFrom: null });
    expect(s.phase).toBe('awaitingRoll');

    // Agora rola 7: entra de novo em fase de Saqueador, e desta vez volta para main.
    s = forcarSete(s, 'ana');
    expect(s.robberReturnPhase).toBe('main');
    expect(['discarding', 'movingRobber']).toContain(s.phase);

    // Ninguém tem cartas (faseMain limpa as mãos), então vai direto mover.
    expect(s.phase).toBe('movingRobber');
    const segundoDestino = s.board.hexOrder.find(
      (h) =>
        h !== s.robberHex && s.board.hexes[h]!.vertices.every((v) => s.buildings[v] === undefined),
    )!;
    s = apply(s, { type: 'moveRobber', player: 'ana', hexId: segundoDestino, stealFrom: null });
    expect(s.phase).toBe('main');

    // E a cota de 1 carta por turno continua gasta.
    expect(s.devCardPlayedThisTurn).toBe(true);
  });

  it('estradas grátis sobrevivem à fase do Saqueador', () => {
    // Construção de Estradas jogada antes da rolagem; sai 7 no meio. As duas
    // estradas grátis têm que continuar disponíveis depois.
    let s = giveDevCard(faseMain(), 'ana', 'roadBuilding');
    s = patch(s, (draft) => {
      draft.phase = 'awaitingRoll';
    });

    s = apply(s, { type: 'playRoadBuilding', player: 'ana' });
    expect(s.freeRoadsRemaining).toBe(2);

    s = forcarSete(s, 'ana');
    const destino = s.board.hexOrder.find(
      (h) =>
        h !== s.robberHex && s.board.hexes[h]!.vertices.every((v) => s.buildings[v] === undefined),
    )!;
    s = apply(s, { type: 'moveRobber', player: 'ana', hexId: destino, stealFrom: null });

    expect(s.phase).toBe('main');
    expect(s.freeRoadsRemaining).toBe(2);

    // E de fato dá para construir sem pagar.
    const meuVertice = Object.entries(s.buildings).find(([, b]) => b.owner === 'ana')![0];
    const edgeId = s.board.vertices[meuVertice]!.edges.find((e) => s.roads[e] === undefined)!;
    s = apply(s, { type: 'placeRoad', player: 'ana', edgeId });
    expect(s.freeRoadsRemaining).toBe(1);
  });

  it('não deixa jogar carta durante a fase do Saqueador', () => {
    let s = giveDevCard(faseMain(), 'ana', 'monopoly');
    s = patch(s, (draft) => {
      draft.phase = 'movingRobber';
    });
    expectError(s, { type: 'playMonopoly', player: 'ana', resource: 'ore' }, 'INVALID_PHASE');
  });

  it('não deixa comprar carta antes da rolagem', () => {
    let s = grant(faseMain(), 'ana', COSTS.devCard);
    s = patch(s, (draft) => {
      draft.phase = 'awaitingRoll';
    });
    expectError(s, { type: 'buyDevCard', player: 'ana' }, 'INVALID_PHASE');
  });
});

describe('Monopólio', () => {
  it('recolhe todas as cartas do recurso escolhido de todos os jogadores', () => {
    let s = giveDevCard(faseMain(), 'ana', 'monopoly');
    s = grant(s, 'bruno', { wool: 3 });
    s = grant(s, 'carla', { wool: 2 });
    s = grant(s, 'davi', { ore: 4 });
    s = grant(s, 'ana', { wool: 1 });

    s = apply(s, { type: 'playMonopoly', player: 'ana', resource: 'wool' });

    expect(s.players.find((p) => p.id === 'ana')!.resources.wool).toBe(6);
    expect(s.players.find((p) => p.id === 'bruno')!.resources.wool).toBe(0);
    expect(s.players.find((p) => p.id === 'carla')!.resources.wool).toBe(0);
    // Não encosta em outros recursos.
    expect(s.players.find((p) => p.id === 'davi')!.resources.ore).toBe(4);
  });

  it('é jogada válida mesmo quando ninguém tem o recurso', () => {
    let s = giveDevCard(faseMain(), 'ana', 'monopoly');
    s = apply(s, { type: 'playMonopoly', player: 'ana', resource: 'ore' });

    expect(s.players.find((p) => p.id === 'ana')!.resources.ore).toBe(0);
    // A carta foi gasta assim mesmo — é o risco da jogada.
    expect(s.devCardPlayedThisTurn).toBe(true);
    expect(s.players.find((p) => p.id === 'ana')!.devCards.filter((c) => c.played)).toHaveLength(1);
  });

  it('não mexe no banco', () => {
    let s = giveDevCard(faseMain(), 'ana', 'monopoly');
    s = grant(s, 'bruno', { brick: 5 });
    const bancoAntes = { ...s.bank };
    s = apply(s, { type: 'playMonopoly', player: 'ana', resource: 'brick' });
    expect(s.bank).toEqual(bancoAntes);
  });
});
