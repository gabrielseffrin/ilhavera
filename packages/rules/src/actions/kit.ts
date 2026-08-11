/**
 * Contrato dos handlers de ação.
 *
 * `validate` roda sobre o estado **imutável** e devolve um `ErrorCode` ou
 * `null`. `apply` só roda depois de `validate` passar, e aí sim pode mutar o
 * rascunho do Immer à vontade. Essa separação é o que permite
 * `enumerateLegalActions` reaproveitar exatamente a mesma validação que o
 * reducer usa — sem uma segunda implementação das regras para divergir.
 */

import type { ErrorCode } from '../errors.js';
import type { GameEvent, GameState, Phase } from '../state.js';
import type { Action, ActionType } from './types.js';

export type Emit = (event: GameEvent) => void;

export type Handler<A extends Action> = {
  /** Fases em que a ação é sequer considerada. Fora delas: INVALID_PHASE. */
  phases: readonly Phase[];
  /**
   * `current`: só o jogador da vez. `any`: qualquer jogador da partida —
   * usado no descarte paralelo e na resposta a proposta de comércio.
   */
  actor: 'current' | 'any';
  validate: (state: GameState, action: A) => ErrorCode | null;
  apply: (draft: GameState, action: A, emit: Emit) => void;
};

export type HandlerMap = {
  [T in ActionType]: Handler<Extract<Action, { type: T }>>;
};
