/**
 * @ilhavera/protocol — contrato de rede entre cliente e servidor (§5 do roadmap).
 *
 * **Escopo desta fase:** só os esquemas. O servidor da Fase 2 é quem vai
 * consumir isto para validar payload na borda antes de traduzir para uma
 * `Action` do motor. Está aqui desde já para fixar a direção da dependência:
 * `protocol` conhece `rules`, e nunca o contrário — a regra de lint em
 * `eslint.config.js` faz valer isso.
 */

import { ERROR_LABELS } from '@ilhavera/rules';
import type {
  Action,
  ClientView,
  ClientViewDynamic,
  ErrorCode,
  GameEvent,
  PlayerColor,
} from '@ilhavera/rules';
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
  /**
   * `game:event` saiu do contrato na Fase 4, como a §5.2 previa que sairia se a
   * Fase 3 não pedisse por ele — e não pediu. Os eventos narrativos viajam
   * dentro do `state:patch`, junto da versão a que pertencem. Um segundo canal
   * com a mesma informação seria uma segunda versão da verdade, com a agravante
   * de chegar fora de ordem em relação ao estado que ela narra.
   */
  'game:error',
  'room:updated',
  'chat:message',
] as const;

export type ServerEventName = (typeof SERVER_EVENTS)[number];

/**
 * `state:snapshot` — o estado completo de um jogador (§5.2).
 *
 * Carrega `legal` porque enumerar jogadas legais exige o `GameState` cru:
 * `isLegal` de `tradeConfirm` confere se o **parceiro** tem os recursos, e essa
 * é justamente a informação que `toClientView` apaga. Um enumerador no cliente
 * não seria uma segunda implementação das regras — seria uma implementação
 * errada, respondendo com menos informação do que a pergunta exige.
 */
export type SnapshotPayload = {
  view: ClientView;
  legal: Action[];
};

/**
 * `state:patch` — o delta de uma jogada (§5.2).
 *
 * `view` é só a metade que muda: o tabuleiro, o `id` e os ajustes da partida
 * ficaram no snapshot e não se repetem. `events` já vêm projetados e o cliente
 * os concatena ao log — ver `applyClientViewPatch` em `@ilhavera/rules`.
 */
export type PatchPayload = {
  version: number;
  events: GameEvent[];
  view: ClientViewDynamic;
  legal: Action[];
};

export const ROOM_STATUSES = ['lobby', 'playing', 'finished'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export type RoomPlayerView = {
  id: string;
  nickname: string;
  color: PlayerColor;
  connected: boolean;
};

/**
 * `room:updated` — a sala como o lobby a mostra. **Nunca inclui o `GameState`.**
 *
 * Mora no contrato, e não no registro de salas do servidor, porque é payload de
 * evento: o cliente precisa do tipo tanto quanto o servidor, e a alternativa
 * seria o navegador importar de `apps/server` ou redeclarar a forma por conta —
 * as duas maneiras conhecidas de duas pontas divergirem em silêncio.
 */
export type RoomView = {
  code: string;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: RoomPlayerView[];
  /** O host só consegue iniciar quando isto é verdade. */
  canStart: boolean;
};

/** O payload de cada evento servidor → cliente. */
export type ServerEventPayloads = {
  'session:issued': { playerId: string; token: string };
  'state:snapshot': SnapshotPayload;
  'state:patch': PatchPayload;
  'game:error': { requestId: string; code: AckErrorCode };
  'room:updated': RoomView;
  /** Declarado desde a Fase 2; ganha handler na Fase 5, com o chat. */
  'chat:message': { playerId: string; nickname: string; text: string; at: number };
};

/**
 * O payload de um evento pelo nome. A indexação é o que faz o contrato ser
 * verificado: um evento novo em `SERVER_EVENTS` sem entrada em
 * `ServerEventPayloads` para de compilar aqui, e não vira `unknown` calado.
 */
export type ServerEventPayload<E extends ServerEventName> = ServerEventPayloads[E];

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
 * O que o jogador lê quando um comando de sala é recusado.
 *
 * Mora aqui e não em `packages/rules/src/labels.ts`, junto dos rótulos de erro
 * do motor, porque a direção da dependência não permite o contrário: `rules` não
 * conhece `protocol`, e estes códigos são deste pacote. O cliente junta os dois
 * mapas na hora de mostrar.
 *
 * Texto na voz de quem joga, não na de quem depura: "essa sala não existe" é o
 * que aconteceu para o jogador; `ROOM_NOT_FOUND` é o que aconteceu para o log.
 */
export const ROOM_ERROR_LABELS: Readonly<Record<RoomErrorCode, string>> = {
  BAD_PAYLOAD: 'O servidor não entendeu esse comando.',
  INTERNAL: 'Algo deu errado no servidor. Tente de novo.',
  ROOM_NOT_FOUND: 'Não existe sala com esse código.',
  ROOM_FULL: 'Essa sala já está cheia.',
  ROOM_ALREADY_STARTED: 'Essa partida já começou.',
  ROOM_NOT_STARTED: 'A partida ainda não começou.',
  NOT_HOST: 'Só quem criou a sala pode fazer isso.',
  NOT_ENOUGH_PLAYERS: 'Faltam jogadores para começar.',
  ALREADY_IN_ROOM: 'Você já está em uma sala.',
  NOT_IN_ROOM: 'Você não está em nenhuma sala.',
  NICKNAME_TAKEN: 'Já tem alguém com esse apelido na sala.',
  RATE_LIMITED: 'Calma — comandos demais em pouco tempo.',
};

/**
 * O texto de um código de erro, venha da sala ou do motor.
 *
 * Aceita `string` porque `Ack.error` é `string` de propósito: um cliente que não
 * foi atualizado tem que conseguir dizer **alguma coisa** diante de um código
 * que ainda não conhece. Ficar mudo por não reconhecer a recusa é o pior dos
 * dois mundos — o jogador vê o clique não fazer nada e não sabe por quê.
 *
 * É o único lugar que enxerga os dois mapas: `rules` não conhece `protocol`.
 */
export function errorLabel(code: string): string {
  return (
    ROOM_ERROR_LABELS[code as RoomErrorCode] ??
    ERROR_LABELS[code as ErrorCode] ??
    'A jogada não foi aceita.'
  );
}

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
