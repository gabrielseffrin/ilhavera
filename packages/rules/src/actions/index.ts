/**
 * Registro de handlers: qual ação é legal em qual fase, e por quem.
 *
 * Esta tabela é a máquina de estados de §4.4 escrita de forma declarativa.
 * `reduce` consulta só ela para decidir se a ação sequer chega à validação —
 * é o ponto único onde "fase + ator" é checado.
 */

import type { GameState } from '../state.js';
import { currentPlayer } from '../query.js';
import type { HandlerMap } from './kit.js';
import {
  applySetupRoad,
  applySetupSettlement,
  validateSetupRoad,
  validateSetupSettlement,
} from './setup.js';
import {
  applyBuildCity,
  applyBuildRoad,
  applyBuildSettlement,
  validateBuildCity,
  validateBuildRoad,
  validateBuildSettlement,
} from './build.js';
import { applyRollDice, validateRollDice } from './roll.js';
import { applyDiscard, applyMoveRobber, validateDiscard, validateMoveRobber } from './robber.js';
import {
  applyBuyDevCard,
  applyPlayKnight,
  applyPlayMonopoly,
  applyPlayRoadBuilding,
  applyPlayYearOfPlenty,
  validateBuyDevCard,
  validatePlayKnight,
  validatePlayMonopoly,
  validatePlayRoadBuilding,
  validatePlayYearOfPlenty,
} from './devcards.js';
import {
  applyTradeBank,
  applyTradeConfirm,
  applyTradeOffer,
  applyTradeRespond,
  validateTradeBank,
  validateTradeConfirm,
  validateTradeOffer,
  validateTradeRespond,
} from './trade.js';

const SETUP_PHASES = ['setup1', 'setup2'] as const;
/** Cartas de Progresso podem ser jogadas antes da rolagem ou no turno principal. */
const DEV_CARD_PHASES = ['awaitingRoll', 'main'] as const;

export const HANDLERS: HandlerMap = {
  placeSettlement: {
    phases: [...SETUP_PHASES, 'main'],
    actor: 'current',
    validate: (state, action) =>
      state.phase === 'main'
        ? validateBuildSettlement(state, action)
        : validateSetupSettlement(state, action),
    apply: (draft, action, emit) => {
      if (draft.phase === 'main') applyBuildSettlement(draft, action, emit);
      else applySetupSettlement(draft, action, emit);
    },
  },

  placeRoad: {
    phases: [...SETUP_PHASES, 'main'],
    actor: 'current',
    validate: (state, action) =>
      state.phase === 'main' ? validateBuildRoad(state, action) : validateSetupRoad(state, action),
    apply: (draft, action, emit) => {
      if (draft.phase === 'main') applyBuildRoad(draft, action, emit);
      else applySetupRoad(draft, action, emit);
    },
  },

  buildCity: {
    phases: ['main'],
    actor: 'current',
    validate: validateBuildCity,
    apply: applyBuildCity,
  },

  rollDice: {
    phases: ['awaitingRoll'],
    actor: 'current',
    validate: validateRollDice,
    apply: applyRollDice,
  },

  discard: {
    // Descarte é paralelo: qualquer jogador com pendência responde, não só o
    // da vez. É a única fase em que jogadores agem fora do próprio turno.
    phases: ['discarding'],
    actor: 'any',
    validate: validateDiscard,
    apply: applyDiscard,
  },

  moveRobber: {
    phases: ['movingRobber'],
    actor: 'current',
    validate: validateMoveRobber,
    apply: applyMoveRobber,
  },

  buyDevCard: {
    phases: ['main'],
    actor: 'current',
    validate: validateBuyDevCard,
    apply: applyBuyDevCard,
  },

  playKnight: {
    phases: [...DEV_CARD_PHASES],
    actor: 'current',
    validate: validatePlayKnight,
    apply: applyPlayKnight,
  },

  playRoadBuilding: {
    phases: [...DEV_CARD_PHASES],
    actor: 'current',
    validate: validatePlayRoadBuilding,
    apply: applyPlayRoadBuilding,
  },

  playYearOfPlenty: {
    phases: [...DEV_CARD_PHASES],
    actor: 'current',
    validate: validatePlayYearOfPlenty,
    apply: applyPlayYearOfPlenty,
  },

  playMonopoly: {
    phases: [...DEV_CARD_PHASES],
    actor: 'current',
    validate: validatePlayMonopoly,
    apply: applyPlayMonopoly,
  },

  tradeBank: {
    phases: ['main'],
    actor: 'current',
    validate: validateTradeBank,
    apply: applyTradeBank,
  },

  tradeOffer: {
    phases: ['main'],
    actor: 'current',
    validate: validateTradeOffer,
    apply: applyTradeOffer,
  },

  tradeRespond: {
    phases: ['main'],
    actor: 'any',
    validate: validateTradeRespond,
    apply: applyTradeRespond,
  },

  tradeConfirm: {
    phases: ['main'],
    actor: 'current',
    validate: validateTradeConfirm,
    apply: applyTradeConfirm,
  },

  endTurn: {
    phases: ['main'],
    actor: 'current',
    validate: () => null,
    apply: (draft, action, emit) => {
      endTurn(draft);
      emit({
        type: 'turnEnded',
        actor: action.player,
        data: { nextPlayer: currentPlayer(draft).id, turnNumber: draft.turnNumber },
      });
    },
  },
};

/**
 * Encerramento de turno: tudo que é "por turno" volta ao zero aqui.
 * Estradas grátis não usadas são perdidas, e uma proposta de comércio aberta
 * morre com o turno.
 */
function endTurn(draft: GameState): void {
  draft.devCardPlayedThisTurn = false;
  draft.freeRoadsRemaining = 0;
  draft.activeTrade = null;
  draft.lastRoll = null;
  draft.currentPlayerIndex = (draft.currentPlayerIndex + 1) % draft.players.length;
  draft.turnNumber += 1;
  draft.phase = 'awaitingRoll';
}

export * from './types.js';
export type { Emit, Handler, HandlerMap } from './kit.js';
