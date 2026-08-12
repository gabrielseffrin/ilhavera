/**
 * Enumeração de ações legais.
 *
 * Não está listada no roadmap, mas paga três contas de uma vez: alimenta o
 * driver dos testes de propriedade (que precisa jogar partidas inteiras só com
 * jogadas válidas), alimenta o menu da CLI da Fase 1, e na Fase 3 alimenta o
 * destaque de vértices/arestas jogáveis no cliente — o item de §4.2 que
 * justifica compartilhar o motor entre servidor e navegador.
 *
 * Crucialmente, reaproveita a MESMA validação do reducer. Se enumerar e
 * validar fossem implementações separadas, elas divergiriam, e o cliente
 * passaria a destacar jogadas que o servidor rejeita.
 */

import { HANDLERS } from './actions/index.js';
import type { Action } from './actions/types.js';
import type { Handler } from './actions/kit.js';
import type { GameState } from './state.js';
import { RESOURCES, emptyResourceCount, type PlayerId, type Resource } from './types.js';
import {
  countResources,
  currentPlayer,
  findPlayer,
  playerBuildings,
  stealCandidates,
} from './query.js';

/**
 * Mesmos portões do `reduce` (fase, ator, validação), sem aplicar nada.
 * Serve tanto para filtrar candidatos quanto para o cliente desabilitar botões
 * antes do round-trip.
 */
export function isLegal(state: GameState, action: Action): boolean {
  if (state.phase === 'finished' || state.winner !== null) return false;
  if (!state.players.some((p) => p.id === action.player)) return false;

  const handler = HANDLERS[action.type] as Handler<Action> | undefined;
  if (handler === undefined) return false;
  if (!handler.phases.includes(state.phase)) return false;

  if (handler.actor === 'current' && currentPlayer(state).id !== action.player) return false;

  return handler.validate(state, action) === null;
}

export type EnumerateOptions = {
  /**
   * Propostas de comércio entre jogadores são combinatoriamente infinitas.
   * Quando ligado, gera uma amostra representativa (trocas 1:1), o bastante
   * para exercitar o caminho sem explodir a lista.
   */
  includeTradeOffers?: boolean;
};

export function enumerateLegalActions(
  state: GameState,
  playerId: PlayerId,
  options: EnumerateOptions = {},
): Action[] {
  const candidates = candidateActions(state, playerId, options);
  return candidates.filter((a) => isLegal(state, a));
}

function candidateActions(
  state: GameState,
  playerId: PlayerId,
  options: EnumerateOptions,
): Action[] {
  const out: Action[] = [];
  const others = state.players.filter((p) => p.id !== playerId).map((p) => p.id);

  switch (state.phase) {
    case 'setup1':
    case 'setup2': {
      if (state.setupStep === 'settlement') {
        for (const vertexId of state.board.vertexOrder) {
          out.push({ type: 'placeSettlement', player: playerId, vertexId });
        }
      } else if (state.lastSetupVertex !== null) {
        const vertex = state.board.vertices[state.lastSetupVertex];
        for (const edgeId of vertex?.edges ?? []) {
          out.push({ type: 'placeRoad', player: playerId, edgeId });
        }
      }
      break;
    }

    case 'awaitingRoll': {
      out.push({ type: 'rollDice', player: playerId });
      out.push(...devCardActions(playerId));
      break;
    }

    case 'discarding': {
      out.push(...discardCandidates(state, playerId));
      break;
    }

    case 'movingRobber': {
      for (const hexId of state.board.hexOrder) {
        if (hexId === state.robberHex) continue;
        const targets = stealCandidates(state, hexId, playerId);
        if (targets.length === 0) {
          out.push({ type: 'moveRobber', player: playerId, hexId, stealFrom: null });
        } else {
          for (const stealFrom of targets) {
            out.push({ type: 'moveRobber', player: playerId, hexId, stealFrom });
          }
        }
      }
      break;
    }

    case 'main': {
      for (const vertexId of state.board.vertexOrder) {
        out.push({ type: 'placeSettlement', player: playerId, vertexId });
      }
      for (const edgeId of state.board.edgeOrder) {
        out.push({ type: 'placeRoad', player: playerId, edgeId });
      }
      for (const b of playerBuildings(state, playerId)) {
        if (b.type === 'settlement') {
          out.push({ type: 'buildCity', player: playerId, vertexId: b.vertexId });
        }
      }

      out.push({ type: 'buyDevCard', player: playerId });
      out.push(...devCardActions(playerId));

      for (const give of RESOURCES) {
        for (const receive of RESOURCES) {
          if (give === receive) continue;
          out.push({ type: 'tradeBank', player: playerId, give, receive });
        }
      }

      if (options.includeTradeOffers === true) {
        out.push(...tradeOfferSamples(playerId, others));
      }

      // Responder e consumar propostas abertas.
      const trade = state.activeTrade;
      if (trade !== null) {
        if (trade.targets.includes(playerId)) {
          out.push({
            type: 'tradeRespond',
            player: playerId,
            tradeId: trade.id,
            response: { type: 'accept' },
          });
          out.push({
            type: 'tradeRespond',
            player: playerId,
            tradeId: trade.id,
            response: { type: 'decline' },
          });
        }
        if (trade.proposer === playerId) {
          for (const [responder, response] of Object.entries(trade.responses)) {
            if (response.type === 'decline') continue;
            out.push({
              type: 'tradeConfirm',
              player: playerId,
              tradeId: trade.id,
              withPlayer: responder,
            });
          }
        }
      }

      out.push({ type: 'endTurn', player: playerId });
      break;
    }

    case 'lobby':
    case 'finished':
      break;
  }

  return out;
}

function devCardActions(playerId: PlayerId): Action[] {
  const out: Action[] = [
    { type: 'playKnight', player: playerId },
    { type: 'playRoadBuilding', player: playerId },
  ];
  for (const resource of RESOURCES) {
    out.push({ type: 'playMonopoly', player: playerId, resource });
  }
  // Pares não ordenados: (a, b) e (b, a) são a mesma jogada.
  for (let i = 0; i < RESOURCES.length; i++) {
    for (let j = i; j < RESOURCES.length; j++) {
      out.push({
        type: 'playYearOfPlenty',
        player: playerId,
        resources: [RESOURCES[i] as Resource, RESOURCES[j] as Resource],
      });
    }
  }
  return out;
}

/**
 * Descartes possíveis são exponenciais na mão; enumerar todos não faz sentido.
 * Duas heurísticas determinísticas cobrem o caminho: descartar do recurso mais
 * abundante e descartar do menos abundante. A UI de verdade deixa o jogador
 * montar o descarte à mão.
 */
function discardCandidates(state: GameState, playerId: PlayerId): Action[] {
  const required = state.pendingDiscards[playerId];
  const player = findPlayer(state, playerId);
  if (required === undefined || player === undefined) return [];

  const build = (order: Resource[]): Action => {
    const resources = emptyResourceCount();
    let left = required;
    for (const r of order) {
      const take = Math.min(left, player.resources[r]);
      resources[r] = take;
      left -= take;
      if (left === 0) break;
    }
    return { type: 'discard', player: playerId, resources };
  };

  const byAbundance = [...RESOURCES].sort((a, b) => player.resources[b] - player.resources[a]);
  const byScarcity = [...RESOURCES]
    .filter((r) => player.resources[r] > 0)
    .sort((a, b) => player.resources[a] - player.resources[b]);

  const out = [build(byAbundance)];
  if (byScarcity.length > 0) out.push(build(byScarcity));
  return out;
}

/** Amostra de propostas: trocas de 1 recurso por 1 recurso com cada adversário. */
function tradeOfferSamples(playerId: PlayerId, others: PlayerId[]): Action[] {
  const out: Action[] = [];
  if (others.length === 0) return out;
  for (const give of RESOURCES) {
    for (const receive of RESOURCES) {
      if (give === receive) continue;
      const terms = { give: emptyResourceCount(), receive: emptyResourceCount() };
      terms.give[give] = 1;
      terms.receive[receive] = 1;
      out.push({ type: 'tradeOffer', player: playerId, terms, targets: [...others] });
    }
  }
  return out;
}

/** Quantas cartas o jogador precisa descartar agora (0 se nenhuma). */
export function pendingDiscardCount(state: GameState, playerId: PlayerId): number {
  return state.pendingDiscards[playerId] ?? 0;
}

/** Total de cartas na mão — atalho usado por CLI e UI. */
export function handSize(state: GameState, playerId: PlayerId): number {
  const p = findPlayer(state, playerId);
  return p === undefined ? 0 : countResources(p.resources);
}
