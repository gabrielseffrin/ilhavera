/**
 * Driver de partidas aleatórias.
 *
 * Joga partidas inteiras escolhendo **apenas ações legais**, sorteadas com o
 * mesmo PRNG determinístico do motor. É o motor dos testes de propriedade
 * (§8, nível 2): milhares de partidas, invariantes checadas a cada ação.
 *
 * As jogadas são sorteadas com peso, não uniformemente. Com peso uniforme a
 * partida encerraria turno o tempo todo e quase nunca chegaria a 10 PV — e aí
 * os testes nunca exercitariam vitória, cidades, bônus ou baralho esgotado.
 */

import { createGame } from '../../src/game.js';
import { reduce } from '../../src/reduce.js';
import { enumerateLegalActions } from '../../src/legal.js';
import { randomInt } from '../../src/rng.js';
import type { Action, ActionType } from '../../src/actions/types.js';
import type { GameState } from '../../src/state.js';
import type { PlayerColor, PlayerId } from '../../src/types.js';

/**
 * Peso por **tipo** de ação, não por candidato. A diferença importa: numa fase
 * principal típica existem ~40 arestas livres e 1 ou 2 cidades construíveis.
 * Pesar candidato a candidato faria "colocar estrada" afogar "construir
 * cidade" 40 a 1, e as partidas nunca chegariam a 10 PV.
 */
const WEIGHTS: Partial<Record<ActionType, number>> = {
  endTurn: 8,
  placeSettlement: 30,
  buildCity: 40,
  placeRoad: 20,
  buyDevCard: 18,
  playKnight: 12,
  playRoadBuilding: 12,
  playYearOfPlenty: 12,
  playMonopoly: 12,
  tradeBank: 10,
  tradeOffer: 4,
  // Uma proposta aberta deve ser resolvida logo, não ficar rolando pela mesa.
  tradeRespond: 40,
  tradeConfirm: 40,
};

const DEFAULT_WEIGHT = 20;

const COLORS: PlayerColor[] = ['red', 'blue', 'white', 'orange'];

export type StepHook = (context: {
  state: GameState;
  action: Action;
  step: number;
}) => void;

export type PlayOptions = {
  playerCount?: number;
  maxSteps?: number;
  includeTradeOffers?: boolean;
  boardMode?: 'balanced' | 'random';
  /** Chamado após cada ação aplicada com sucesso. */
  onStep?: StepHook;
};

export type PlayResult = {
  state: GameState;
  actions: Action[];
  steps: number;
  finished: boolean;
};

export function playRandomGame(seed: string, options: PlayOptions = {}): PlayResult {
  const playerCount = options.playerCount ?? 4;
  const maxSteps = options.maxSteps ?? 4000;

  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i}` as PlayerId,
    name: `Jogador ${i + 1}`,
    color: COLORS[i] as PlayerColor,
  }));

  let state = createGame({
    id: `game-${seed}`,
    seed,
    players,
    settings: { boardMode: options.boardMode ?? 'balanced' },
  });

  const actions: Action[] = [];
  // Cursor próprio para as escolhas do driver: não pode consumir o cursor do
  // motor, senão o replay do log daria outra partida.
  let driverCursor = 0;
  let step = 0;

  while (state.phase !== 'finished' && step < maxSteps) {
    const actor = nextActor(state, seed, driverCursor);
    driverCursor = actor.cursor;

    const legal = enumerateLegalActions(state, actor.playerId, {
      includeTradeOffers: options.includeTradeOffers ?? false,
    });
    if (legal.length === 0) {
      throw new Error(
        `partida travada: fase ${state.phase}, jogador ${actor.playerId}, sem ações legais`,
      );
    }

    const choice = weightedPick(legal, seed, driverCursor);
    driverCursor = choice.cursor;

    const result = reduce(state, choice.action);
    if (!result.ok) {
      throw new Error(
        `ação enumerada como legal foi rejeitada: ${choice.action.type} → ${result.error}`,
      );
    }

    state = result.state;
    actions.push(choice.action);
    step++;
    options.onStep?.({ state, action: choice.action, step });
  }

  return { state, actions, steps: step, finished: state.phase === 'finished' };
}

/**
 * Quem age agora. Na fase de descarte, os descartes são paralelos: qualquer um
 * dos pendentes pode responder, em qualquer ordem — e sortear a ordem é
 * justamente o que expõe bugs de "assumi que o jogador da vez descarta
 * primeiro".
 */
function nextActor(
  state: GameState,
  seed: string,
  cursor: number,
): { playerId: PlayerId; cursor: number } {
  if (state.phase === 'discarding') {
    const pending = Object.keys(state.pendingDiscards).sort();
    if (pending.length > 0) {
      const d = randomInt(seed, cursor, pending.length);
      return { playerId: pending[d.value] as PlayerId, cursor: d.cursor };
    }
  }

  // Fora do descarte, responder a uma proposta de comércio é a única ação de
  // quem não é o jogador da vez.
  const trade = state.activeTrade;
  if (trade !== null && state.phase === 'main') {
    const pendingTargets = trade.targets.filter((t) => trade.responses[t] === undefined);
    if (pendingTargets.length > 0) {
      const d = randomInt(seed, cursor, pendingTargets.length + 1);
      if (d.value < pendingTargets.length) {
        return { playerId: pendingTargets[d.value] as PlayerId, cursor: d.cursor };
      }
      return { playerId: (state.players[state.currentPlayerIndex] as { id: string }).id, cursor: d.cursor };
    }
  }

  return {
    playerId: (state.players[state.currentPlayerIndex] as { id: string }).id,
    cursor,
  };
}

/** Sorteia o tipo de ação pelo peso e depois um candidato daquele tipo, uniformemente. */
function weightedPick(
  actions: Action[],
  seed: string,
  cursor: number,
): { action: Action; cursor: number } {
  const byType = new Map<ActionType, Action[]>();
  for (const action of actions) {
    const list = byType.get(action.type);
    if (list === undefined) byType.set(action.type, [action]);
    else list.push(action);
  }

  const types = [...byType.keys()].sort();
  let total = 0;
  const weights = types.map((t) => {
    const w = WEIGHTS[t] ?? DEFAULT_WEIGHT;
    total += w;
    return w;
  });

  const typeDraw = randomInt(seed, cursor, total);
  let acc = 0;
  let chosenType = types[types.length - 1] as ActionType;
  for (let i = 0; i < types.length; i++) {
    acc += weights[i] as number;
    if (typeDraw.value < acc) {
      chosenType = types[i] as ActionType;
      break;
    }
  }

  const candidates = byType.get(chosenType) as Action[];
  const pick = randomInt(seed, typeDraw.cursor, candidates.length);
  return { action: candidates[pick.value] as Action, cursor: pick.cursor };
}

/**
 * Reexecuta um log de ações a partir de uma partida nova com a mesma seed.
 * Se o motor for realmente determinístico, o estado final é idêntico — é o
 * teste que sustenta a promessa de replay de §4.1.
 */
export function replay(seed: string, playerCount: number, actions: Action[]): GameState {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i}` as PlayerId,
    name: `Jogador ${i + 1}`,
    color: COLORS[i] as PlayerColor,
  }));

  let state = createGame({ id: `game-${seed}`, seed, players });
  for (const action of actions) {
    const result = reduce(state, action);
    if (!result.ok) throw new Error(`replay divergiu em ${action.type}: ${result.error}`);
    state = result.state;
  }
  return state;
}
