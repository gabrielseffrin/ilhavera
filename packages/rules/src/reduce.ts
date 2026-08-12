/**
 * O reducer — §4.1 do roadmap: `reduce(state, action) → { state, events }`,
 * puro e determinístico.
 *
 * Contrato central: **jogada inválida é valor de retorno, não exceção**. Uma
 * exceção escapando daqui significa bug do motor, e o servidor pode tratar as
 * duas coisas de forma diferente — uma vira `ack: { ok: false }`, a outra vira
 * alerta no Sentry.
 */

import { produce } from 'immer';

import type { ErrorCode } from './errors.js';
import type { GameEvent, GameState } from './state.js';
import type { Action } from './actions/types.js';
import type { Handler } from './actions/kit.js';
import { HANDLERS } from './actions/index.js';
import { currentPlayer, findPlayer } from './query.js';
import { recomputeLongestRoad } from './scoring/longestRoad.js';
import { hasWon, recomputeLargestArmy, victoryPoints } from './scoring/victory.js';

export type ReduceResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: ErrorCode };

/** Ações que podem alterar a topologia de estradas e, portanto, o bônus. */
const AFFECTS_LONGEST_ROAD = new Set<Action['type']>(['placeRoad', 'placeSettlement']);

export function reduce(state: GameState, action: Action): ReduceResult {
  if (state.phase === 'finished' || state.winner !== null) {
    return { ok: false, error: 'GAME_FINISHED' };
  }

  if (findPlayer(state, action.player) === undefined) {
    return { ok: false, error: 'UNKNOWN_PLAYER' };
  }

  // O cast é necessário porque TS não estreita a ação pela chave do mapa;
  // `HandlerMap` já garante que cada chave aponta para o handler certo.
  const handler = HANDLERS[action.type] as Handler<Action> | undefined;
  if (handler === undefined) return { ok: false, error: 'INVALID_ACTION' };

  if (!handler.phases.includes(state.phase)) return { ok: false, error: 'INVALID_PHASE' };

  if (handler.actor === 'current' && currentPlayer(state).id !== action.player) {
    return { ok: false, error: 'NOT_YOUR_TURN' };
  }

  const error = handler.validate(state, action);
  if (error !== null) return { ok: false, error };

  const events: GameEvent[] = [];
  const next = produce(state, (draft) => {
    const emit = (event: GameEvent): void => {
      events.push(event);
      draft.log.push(event);
    };

    handler.apply(draft, action, emit);
    settleBonuses(draft, action, emit);
    checkVictory(draft, emit);
    draft.version += 1;
  });

  return { ok: true, state: next, events };
}

/**
 * Recalcula os bônus depois da ação.
 *
 * Estrada Mais Longa só é recalculada quando algo pôde mexer nela — colocar
 * estrada, ou colocar assentamento (que pode **quebrar** a rota de um
 * adversário). Rodar a DFS em toda ação seria desperdício num caminho quente.
 */
function settleBonuses(draft: GameState, action: Action, emit: (e: GameEvent) => void): void {
  if (AFFECTS_LONGEST_ROAD.has(action.type)) {
    const next = recomputeLongestRoad(draft, draft.longestRoad);
    if (next.owner !== draft.longestRoad.owner || next.length !== draft.longestRoad.length) {
      draft.longestRoad = next;
      emit({ type: 'longestRoadChanged', data: { owner: next.owner, length: next.length } });
    }
  }

  if (action.type === 'playKnight') {
    const next = recomputeLargestArmy(draft, draft.largestArmy);
    if (next.owner !== draft.largestArmy.owner || next.size !== draft.largestArmy.size) {
      draft.largestArmy = next;
      emit({ type: 'largestArmyChanged', data: { owner: next.owner, size: next.size } });
    }
  }
}

/**
 * §3.4: a vitória é verificada **apenas no turno do próprio jogador**. Um
 * jogador pode cruzar os 10 PV por conta de uma jogada alheia — por exemplo,
 * quando alguém quebra a Estrada Mais Longa de um terceiro e o bônus vem
 * parar nele — e só vence quando a vez dele chegar.
 */
function checkVictory(draft: GameState, emit: (e: GameEvent) => void): void {
  if (draft.phase === 'setup1' || draft.phase === 'setup2' || draft.phase === 'lobby') return;

  const current = currentPlayer(draft);
  if (!hasWon(draft, current.id)) return;

  draft.winner = current.id;
  draft.phase = 'finished';
  emit({
    type: 'gameWon',
    actor: current.id,
    data: { victoryPoints: victoryPoints(draft, current.id, true).total },
  });
}
