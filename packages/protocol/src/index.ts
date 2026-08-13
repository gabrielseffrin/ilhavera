/**
 * @ilhavera/protocol — contrato de rede entre cliente e servidor (§5 do roadmap).
 *
 * **Escopo desta fase:** só os esquemas. O servidor da Fase 2 é quem vai
 * consumir isto para validar payload na borda antes de traduzir para uma
 * `Action` do motor. Está aqui desde já para fixar a direção da dependência:
 * `protocol` conhece `rules`, e nunca o contrário — a regra de lint em
 * `eslint.config.js` faz valer isso.
 */

import type { ErrorCode } from '@ilhavera/rules';
import { z } from 'zod';

export * from './actions.js';

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

const NICKNAME = z.string().trim().min(1).max(24);

/**
 * Código de sala: 6 caracteres de um alfabeto sem `0/O` nem `1/I/L`, porque o
 * código é ditado em voz alta ou copiado de uma mensagem. Aceita minúsculas na
 * entrada e normaliza — quem digita não deve precisar saber disso.
 */
const ROOM_CODE = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/, 'código de sala inválido'));

/** Ajustes de partida que o host escolhe ao criar a sala. */
export const ROOM_SETTINGS = z.object({
  targetVictoryPoints: z.number().int().min(3).max(20).default(10),
  boardMode: z.enum(['balanced', 'random']).default('balanced'),
});

export type RoomSettings = z.infer<typeof ROOM_SETTINGS>;

/**
 * Comandos cliente → servidor (§5.1). Todo comando carrega `requestId` para
 * idempotência: reconexão pode reenviar, e o servidor precisa saber que já
 * aplicou aquilo.
 */
export const COMMANDS = {
  'room:create': z.object({ nickname: NICKNAME, settings: ROOM_SETTINGS.default({}) }),
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

  /**
   * "Perdi o fio, me manda o estado inteiro" — a regra de consistência de §5.2.
   * O cliente pede quando vê um salto de versão entre dois `state:patch`, e o
   * servidor responde com um `state:snapshot`.
   *
   * É comando e não evento porque quem sabe que perdeu algo é o cliente: o
   * servidor não tem como distinguir um patch que não chegou de um patch que
   * chegou e ainda não foi processado.
   */
  'state:resync': z.object({}),
} as const;

export type CommandName = keyof typeof COMMANDS;

/** Payload já validado de um comando — o que o handler do servidor recebe. */
export type CommandPayload<K extends CommandName> = z.infer<(typeof COMMANDS)[K]>;

/**
 * Todo comando carrega `requestId`. Ele precisa ser **único por jogador**:
 * reusar um `requestId` numa jogada diferente faz a segunda ser silenciosamente
 * ignorada e responder com o ack da primeira, que é justamente o que dá a
 * idempotência na reconexão. `crypto.randomUUID()` no cliente resolve.
 */
export const ENVELOPE = z.object({ requestId: z.string().min(1) });

/** Eventos servidor → cliente (§5.2). */
export const SERVER_EVENTS = [
  /**
   * Fora da §5.2, acrescentado na Fase 2: o servidor emite a identidade recém
   * criada para o cliente guardar. Só chega a quem conectou sem token válido.
   */
  'session:issued',
  'state:snapshot',
  'state:patch',
  'game:event',
  'game:error',
  'room:updated',
  'chat:message',
] as const;

export type ServerEventName = (typeof SERVER_EVENTS)[number];

/**
 * Erros de sala — a camada de fora do motor. Os `ErrorCode` de `@ilhavera/rules`
 * cobrem jogada inválida; estes cobrem "essa sala não existe" e "você não é o
 * host", que são decisões do servidor e não do jogo.
 */
export const ROOM_ERROR_CODES = [
  'BAD_PAYLOAD',
  /**
   * O servidor errou — não é regra do jogo. Exceção escapando do motor é bug
   * (ver `reduce.ts`), e sem este código o cliente ficaria sem ack nenhum,
   * caindo no timeout: o pior diagnóstico possível.
   */
  'INTERNAL',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ROOM_ALREADY_STARTED',
  'ROOM_NOT_STARTED',
  'NOT_HOST',
  'NOT_ENOUGH_PLAYERS',
  'ALREADY_IN_ROOM',
  'NOT_IN_ROOM',
  'NICKNAME_TAKEN',
  /**
   * Comandos rápidos demais neste socket. Não é castigo: é o que impede um
   * cliente com laço maluco — ou alguém tentando de propósito — de consumir a
   * fila de uma sala e travar a partida dos outros.
   */
  'RATE_LIMITED',
] as const;

export type RoomErrorCode = (typeof ROOM_ERROR_CODES)[number];

/**
 * O que pode aparecer no `error` de um ack: erro de sala ou jogada rejeitada
 * pelo motor. Serve para o servidor tipar as próprias respostas — o `Ack` segue
 * declarando `error: string` de propósito, porque o cliente tem que tolerar um
 * código que a versão dele ainda não conhece.
 */
export type AckErrorCode = RoomErrorCode | ErrorCode;

/**
 * Resposta de comando. Carrega `data` porque `room:create` precisa devolver o
 * código sorteado — sem isso o cliente teria que esperar um broadcast para
 * saber em que sala entrou.
 */
export type Ack<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

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
