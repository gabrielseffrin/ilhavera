/**
 * Comércio — §3.3 (banco/portos) e §3.5 (entre jogadores).
 */

import type { ErrorCode } from '../errors.js';
import type { GameState, TradeTerms } from '../state.js';
import { RESOURCES, type PlayerId, type ResourceCount } from '../types.js';
import { addResources, bankTradeRate, canAfford, countResources, subtractResources } from '../query.js';
import type { Emit } from './kit.js';
import type { ActionOf } from './types.js';

// ------------------------------------------------------ Comércio com banco

export function validateTradeBank(
  state: GameState,
  action: ActionOf<'tradeBank'>,
): ErrorCode | null {
  const player = state.players.find((p) => p.id === action.player);
  if (player === undefined) return 'UNKNOWN_PLAYER';
  if (!RESOURCES.includes(action.give) || !RESOURCES.includes(action.receive)) {
    return 'INVALID_ACTION';
  }
  // Trocar um recurso por ele mesmo só queima cartas; é erro de comando.
  if (action.give === action.receive) return 'INVALID_TRADE';

  const rate = bankTradeRate(state, player.id, action.give);
  if (player.resources[action.give] < rate) return 'INSUFFICIENT_RESOURCES';
  if (state.bank[action.receive] < 1) return 'BANK_DEPLETED';
  return null;
}

export function applyTradeBank(draft: GameState, action: ActionOf<'tradeBank'>, emit: Emit): void {
  const player = draft.players.find((p) => p.id === action.player);
  if (player === undefined) return;

  const rate = bankTradeRate(draft, player.id, action.give);
  player.resources[action.give] -= rate;
  draft.bank[action.give] += rate;
  player.resources[action.receive] += 1;
  draft.bank[action.receive] -= 1;

  emit({
    type: 'bankTraded',
    actor: player.id,
    data: { give: action.give, receive: action.receive, rate },
  });
}

// -------------------------------------------- Comércio entre jogadores

function termsAreWellFormed(terms: TradeTerms): boolean {
  for (const side of [terms.give, terms.receive]) {
    for (const r of RESOURCES) {
      const n = side[r];
      if (!Number.isInteger(n) || n < 0) return false;
    }
  }
  // Uma negociação precisa ter os dois lados; doação não é comércio.
  return countResources(terms.give) > 0 && countResources(terms.receive) > 0;
}

export function validateTradeOffer(
  state: GameState,
  action: ActionOf<'tradeOffer'>,
): ErrorCode | null {
  const player = state.players.find((p) => p.id === action.player);
  if (player === undefined) return 'UNKNOWN_PLAYER';
  if (!termsAreWellFormed(action.terms)) return 'INVALID_TRADE';

  if (action.targets.length === 0) return 'INVALID_TRADE';
  const seen = new Set<PlayerId>();
  for (const target of action.targets) {
    if (target === player.id) return 'INVALID_TRADE';
    if (seen.has(target)) return 'INVALID_TRADE';
    seen.add(target);
    if (!state.players.some((p) => p.id === target)) return 'UNKNOWN_PLAYER';
  }

  if (!canAfford(player.resources, action.terms.give)) return 'INSUFFICIENT_RESOURCES';
  return null;
}

export function applyTradeOffer(
  draft: GameState,
  action: ActionOf<'tradeOffer'>,
  emit: Emit,
): void {
  // O ID é derivado do estado, não sorteado — mantém o replay determinístico.
  const tradeId = `t${draft.turnNumber}-${draft.tradeSeq}`;
  draft.tradeSeq += 1;

  // Uma nova proposta substitui a anterior: §3.5 diz que só 1 negociação é
  // consumada por proposta, e não existe comando de cancelamento no protocolo.
  draft.activeTrade = {
    id: tradeId,
    proposer: action.player,
    terms: { give: { ...action.terms.give }, receive: { ...action.terms.receive } },
    targets: [...action.targets],
    responses: {},
  };

  emit({
    type: 'tradeOffered',
    actor: action.player,
    data: { tradeId, terms: draft.activeTrade.terms, targets: [...action.targets] },
  });
}

export function validateTradeRespond(
  state: GameState,
  action: ActionOf<'tradeRespond'>,
): ErrorCode | null {
  const trade = state.activeTrade;
  if (trade === null || trade.id !== action.tradeId) return 'TRADE_EXPIRED';
  if (!trade.targets.includes(action.player)) return 'INVALID_TRADE';
  if (action.response.type === 'counter' && !termsAreWellFormed(action.response.terms)) {
    return 'INVALID_TRADE';
  }
  return null;
}

export function applyTradeRespond(
  draft: GameState,
  action: ActionOf<'tradeRespond'>,
  emit: Emit,
): void {
  if (draft.activeTrade === null) return;
  draft.activeTrade.responses[action.player] =
    action.response.type === 'counter'
      ? {
          type: 'counter',
          terms: {
            give: { ...action.response.terms.give },
            receive: { ...action.response.terms.receive },
          },
        }
      : { type: action.response.type };

  emit({
    type: 'tradeResponded',
    actor: action.player,
    data: { tradeId: action.tradeId, response: action.response },
  });
}

/** Termos efetivos: um aceite usa a proposta original, uma contraproposta usa a dela. */
function effectiveTerms(
  state: GameState,
  tradeId: string,
  withPlayer: PlayerId,
): TradeTerms | null {
  const trade = state.activeTrade;
  if (trade === null || trade.id !== tradeId) return null;
  const response = trade.responses[withPlayer];
  if (response === undefined) return null;
  if (response.type === 'accept') return trade.terms;
  if (response.type === 'counter') return response.terms;
  return null;
}

export function validateTradeConfirm(
  state: GameState,
  action: ActionOf<'tradeConfirm'>,
): ErrorCode | null {
  const trade = state.activeTrade;
  if (trade === null || trade.id !== action.tradeId) return 'TRADE_EXPIRED';
  if (trade.proposer !== action.player) return 'NOT_YOUR_TURN';

  const terms = effectiveTerms(state, action.tradeId, action.withPlayer);
  if (terms === null) return 'TRADE_NOT_ACCEPTED';

  const proposer = state.players.find((p) => p.id === action.player);
  const partner = state.players.find((p) => p.id === action.withPlayer);
  if (proposer === undefined || partner === undefined) return 'UNKNOWN_PLAYER';

  // §3.5: o servidor valida que ambos os lados possuem os recursos **no
  // instante da consumação** — não na hora da proposta. Entre uma coisa e
  // outra o jogador pode ter gasto as cartas.
  if (!canAfford(proposer.resources, terms.give)) return 'INSUFFICIENT_RESOURCES';
  if (!canAfford(partner.resources, terms.receive)) return 'INSUFFICIENT_RESOURCES';
  return null;
}

export function applyTradeConfirm(
  draft: GameState,
  action: ActionOf<'tradeConfirm'>,
  emit: Emit,
): void {
  const terms = effectiveTerms(draft, action.tradeId, action.withPlayer);
  if (terms === null) return;

  const proposer = draft.players.find((p) => p.id === action.player);
  const partner = draft.players.find((p) => p.id === action.withPlayer);
  if (proposer === undefined || partner === undefined) return;

  const give: ResourceCount = { ...terms.give };
  const receive: ResourceCount = { ...terms.receive };

  subtractResources(proposer.resources, give);
  addResources(partner.resources, give);
  subtractResources(partner.resources, receive);
  addResources(proposer.resources, receive);

  draft.activeTrade = null;

  emit({
    type: 'tradeCompleted',
    actor: proposer.id,
    data: { tradeId: action.tradeId, partner: partner.id, terms: { give, receive } },
  });
}
