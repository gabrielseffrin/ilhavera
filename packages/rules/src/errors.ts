/**
 * Códigos de erro do motor — §5.3 do roadmap.
 *
 * Jogada inválida é **valor de retorno**, nunca exceção. Exceção aqui significa
 * bug do motor, e é por isso que a distinção importa: o servidor precisa
 * responder `ack: { ok: false, error }` sem derrubar a sala.
 */
export const ERROR_CODES = [
  'NOT_YOUR_TURN',
  'INVALID_PHASE',
  'UNKNOWN_PLAYER',
  'GAME_FINISHED',
  'INSUFFICIENT_RESOURCES',
  'DISTANCE_RULE_VIOLATION',
  'VERTEX_OCCUPIED',
  'VERTEX_NOT_FOUND',
  'EDGE_NOT_FOUND',
  'EDGE_OCCUPIED',
  'HEX_NOT_FOUND',
  'ROAD_NOT_CONNECTED',
  'SETTLEMENT_NOT_CONNECTED',
  'NO_PIECES_LEFT',
  'NOT_YOUR_SETTLEMENT',
  'ALREADY_CITY',
  'DEV_CARD_ALREADY_PLAYED',
  'DEV_CARD_BOUGHT_THIS_TURN',
  'DEV_CARD_NOT_OWNED',
  'DEV_CARD_NOT_PLAYABLE',
  'DEV_DECK_EMPTY',
  'ROBBER_SAME_HEX',
  'INVALID_STEAL_TARGET',
  'BANK_DEPLETED',
  'INVALID_DISCARD',
  'NOTHING_TO_DISCARD',
  'INVALID_TRADE',
  'TRADE_EXPIRED',
  'TRADE_NOT_ACCEPTED',
  'INVALID_PORT_RATE',
  'INVALID_ACTION',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
