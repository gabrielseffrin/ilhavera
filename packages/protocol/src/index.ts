/**
 * @ilhavera/protocol — contrato de rede entre cliente e servidor (§5 do roadmap).
 *
 * **Escopo desta fase:** só os esquemas. O servidor da Fase 2 é quem vai
 * consumir isto para validar payload na borda antes de traduzir para uma
 * `Action` do motor. Está aqui desde já para fixar a direção da dependência:
 * `protocol` conhece `rules`, e nunca o contrário — a regra de lint em
 * `eslint.config.js` faz valer isso.
 */

import { z } from 'zod';

export const RESOURCE = z.enum(['lumber', 'brick', 'wool', 'grain', 'ore']);
export const RESOURCE_COUNT = z.object({
  lumber: z.number().int().nonnegative(),
  brick: z.number().int().nonnegative(),
  wool: z.number().int().nonnegative(),
  grain: z.number().int().nonnegative(),
  ore: z.number().int().nonnegative(),
});

export const TRADE_TERMS = z.object({
  give: RESOURCE_COUNT,
  receive: RESOURCE_COUNT,
});

export const TRADE_RESPONSE = z.discriminatedUnion('type', [
  z.object({ type: z.literal('accept') }),
  z.object({ type: z.literal('decline') }),
  z.object({ type: z.literal('counter'), terms: TRADE_TERMS }),
]);

const NICKNAME = z.string().min(1).max(24);
const ROOM_CODE = z.string().length(6);

/**
 * Comandos cliente → servidor (§5.1). Todo comando carrega `requestId` para
 * idempotência: reconexão pode reenviar, e o servidor precisa saber que já
 * aplicou aquilo.
 */
export const COMMANDS = {
  'room:create': z.object({ nickname: NICKNAME, settings: z.record(z.unknown()).optional() }),
  'room:join': z.object({ code: ROOM_CODE, nickname: NICKNAME }),
  'room:leave': z.object({}),
  'room:start': z.object({}),

  'game:placeSettlement': z.object({ vertexId: z.string() }),
  'game:placeRoad': z.object({ edgeId: z.string() }),
  'game:buildCity': z.object({ vertexId: z.string() }),
  'game:rollDice': z.object({}),
  'game:discard': z.object({ resources: RESOURCE_COUNT }),
  'game:moveRobber': z.object({ hexId: z.string(), stealFrom: z.string().nullable() }),
  'game:buyDevCard': z.object({}),
  'game:playDevCard': z.discriminatedUnion('card', [
    z.object({ card: z.literal('knight') }),
    z.object({ card: z.literal('roadBuilding') }),
    z.object({ card: z.literal('yearOfPlenty'), resources: z.tuple([RESOURCE, RESOURCE]) }),
    z.object({ card: z.literal('monopoly'), resource: RESOURCE }),
  ]),
  'game:tradeBank': z.object({ give: RESOURCE, receive: RESOURCE }),
  'game:tradeOffer': z.object({ terms: TRADE_TERMS, targets: z.array(z.string()).min(1) }),
  'game:tradeRespond': z.object({ tradeId: z.string(), response: TRADE_RESPONSE }),
  'game:tradeConfirm': z.object({ tradeId: z.string(), withPlayerId: z.string() }),
  'game:endTurn': z.object({}),

  'chat:send': z.object({ text: z.string().min(1).max(500) }),
} as const;

export type CommandName = keyof typeof COMMANDS;

export const ENVELOPE = z.object({ requestId: z.string().min(1) });

/** Eventos servidor → cliente (§5.2). */
export const SERVER_EVENTS = [
  'state:snapshot',
  'state:patch',
  'game:event',
  'game:error',
  'room:updated',
  'chat:message',
] as const;

export type ServerEventName = (typeof SERVER_EVENTS)[number];

export type Ack = { ok: true } | { ok: false; error: string };

/**
 * Valida o payload de um comando. É a borda de §5.1 — nada entra no motor sem
 * passar por aqui.
 */
export function parseCommand<K extends CommandName>(
  name: K,
  payload: unknown,
): z.SafeParseReturnType<unknown, z.infer<(typeof COMMANDS)[K]>> {
  return COMMANDS[name].safeParse(payload) as z.SafeParseReturnType<
    unknown,
    z.infer<(typeof COMMANDS)[K]>
  >;
}
