/**
 * Comandos `game:*` e a emissão de estado — §5.1 e §5.2.
 *
 * O caminho de todo comando é sempre o mesmo: `handle` valida o envelope e o
 * payload, `toAction` traduz para o vocabulário do motor, e o `GameRoom` da sala
 * aplica atrás da fila. O servidor não decide nada de regra: quem aceita ou
 * recusa é o `reduce`, e a resposta dele vai direto para o ack.
 *
 * **Este módulo é o único lugar do servidor autorizado a emitir estado de
 * partida**, e emite sempre por jogador, nunca para a sala inteira: cada um vê
 * uma partida diferente, e um `io.to(code).emit` com o estado cru entregaria a
 * mão alheia a todo mundo. Quem sai daqui passou por `toClientView` (estado) ou
 * por `projectEvents` (delta).
 */

import type { FastifyBaseLogger } from 'fastify';

import { toAction, type GameCommandName } from '@ilhavera/protocol';
import type { Action, GameEvent } from '@ilhavera/rules';

import type { SubmitAck } from '../game/room.js';
import type { TurnTimer } from '../game/timer.js';
import type { PlayerId } from '../identity/players.js';
import type { Room, RoomRegistry } from '../rooms/registry.js';
import { handle } from './handle.js';
import type { GameServer, GameSocket } from './types.js';

export type GameDeps = {
  io: GameServer;
  rooms: RoomRegistry;
  log: FastifyBaseLogger;
  /**
   * O relógio da sala. Opcional porque quase todo teste sobe o servidor sem
   * ele, e uma sala sem `turnSeconds` não tem prazo nenhum a informar.
   */
  timer?: Pick<TurnTimer, 'prazoDe' | 'reagendar' | 'cancelar'>;
};

/** O prazo da sala, ou `null` quando não há relógio. */
function prazo(room: Room, timer: GameDeps['timer']): number | null {
  return timer?.prazoDe(room) ?? null;
}

/**
 * Estado completo, um por jogador (§5.2: "enviado ao entrar e ao reconectar").
 *
 * O endereço é a sala privada de cada `playerId`, e não o socket: quem abriu
 * duas abas tem duas conexões e as duas precisam do mesmo estado.
 */
export function emitSnapshot(io: GameServer, room: Room, timer?: GameDeps['timer']): void {
  const game = room.game;
  if (game === null) return;

  const deadline = prazo(room, timer);
  for (const seat of room.seats) {
    io.to(seat.playerId).emit('state:snapshot', {
      ...game.snapshotFor(seat.playerId),
      deadline,
    });
  }
}

/** Snapshot para uma conexão só — o caso da reconexão. */
export function emitSnapshotTo(socket: GameSocket, room: Room, timer?: GameDeps['timer']): void {
  const game = room.game;
  if (game === null) return;

  socket.emit('state:snapshot', {
    ...game.snapshotFor(socket.data.playerId),
    deadline: prazo(room, timer),
  });
}

/**
 * O delta de uma jogada (§5.2). `version` vai junto porque é ela que deixa o
 * cliente perceber que perdeu um patch e pedir `state:resync` — a "regra de
 * consistência" de §5.2.
 *
 * Carrega estado, e não só eventos, porque **o cliente não tem motor**. Até a
 * Fase 3 o patch levava só a narrativa, e ninguém consumia: quem desenhava a
 * tela era o hot-seat, com o `reduce` rodando no próprio navegador. Ligado o
 * socket, derivar o estado novo a partir dos eventos exigiria reimplementar as
 * regras do lado de lá — a reimplementação que §6.1 existe para evitar.
 *
 * O que vai é só a metade que muda: o tabuleiro foi no snapshot e não se repete.
 */
export function emitPatch(
  io: GameServer,
  room: Room,
  events: readonly GameEvent[],
  timer?: GameDeps['timer'],
): void {
  const game = room.game;
  if (game === null) return;

  const version = game.version;
  const deadline = prazo(room, timer);
  for (const seat of room.seats) {
    io.to(seat.playerId).emit('state:patch', {
      version,
      events: game.patchFor(events, seat.playerId),
      view: game.dynamicFor(seat.playerId),
      legal: game.legalFor(seat.playerId),
      deadline,
    });
  }
}

/**
 * Aplica uma jogada e propaga o resultado — o caminho comum do comando de
 * socket e do auto-passe do relógio.
 *
 * Existe para que a jogada automática do `TurnTimer` percorra **exatamente** o
 * mesmo caminho de uma jogada humana: a mesma fila, a mesma idempotência, a
 * mesma persistência, o mesmo `state:patch` e o mesmo encerramento de sala.
 * Um atalho aqui seria uma segunda maneira de a partida andar, e as duas
 * divergiriam no primeiro detalhe que só uma delas passasse a tratar.
 */
export async function aplicarJogada(
  deps: GameDeps,
  room: Room,
  playerId: PlayerId,
  requestId: string,
  action: Action,
): Promise<SubmitAck> {
  const { io, rooms, log, timer } = deps;
  const game = room.game;
  if (game === null) return { ok: false, error: 'ROOM_NOT_STARTED' };

  const { ack, applied, events } = await game.submit({ playerId, requestId, action });

  if (applied) {
    log.debug(
      { code: room.code, jogada: action.type, eventos: events.map((e) => e.type) },
      'jogada aplicada',
    );

    // O prazo reinicia **antes** da emissão, senão o patch levaria o prazo
    // vencido da jogada anterior e o contador da tela piscaria em zero.
    timer?.reagendar(room);
    emitPatch(io, room, events, timer);

    /**
     * O patch vai **antes** de a sala mudar de status: quem acabou de vencer
     * precisa receber o estado final, senão a tela de fim de partida não teria
     * placar para mostrar. Encerrar a sala é arrumação do servidor, e vem
     * depois de a mesa saber o que aconteceu.
     */
    if (events.some((e) => e.type === 'gameWon')) {
      log.info({ code: room.code, vencedor: playerId }, 'partida encerrada');
      rooms.finish(room);
      timer?.reagendar(room);
    }
  }

  return ack;
}

export function registerGameCommands(socket: GameSocket, deps: GameDeps): void {
  /**
   * `state:resync` — o outro lado da regra de consistência de §5.2.
   *
   * Vai para o socket que pediu, não para a sala: quem perdeu o fio foi esta
   * conexão. E devolve o estado no ack **e** como `state:snapshot`, porque o
   * cliente pode ter pedido por dois motivos diferentes — um salto de versão
   * que ele quer resolver na hora (ack) ou uma releitura geral que o store dele
   * consome pelo mesmo caminho de sempre (evento).
   */
  handle(
    socket,
    'state:resync',
    (_payload, playerId) => {
      const room = deps.rooms.byPlayer(playerId);
      if (room === undefined) return { ok: false, error: 'NOT_IN_ROOM' };
      if (room.game === null) return { ok: false, error: 'ROOM_NOT_STARTED' };

      // Com o prazo, como toda emissão de estado: um resync que devolvesse o
      // estado sem o relógio deixaria o contador da tela parado até a jogada
      // seguinte, justo em quem acabou de perceber que ficou para trás.
      const snapshot = {
        ...room.game.snapshotFor(playerId),
        deadline: prazo(room, deps.timer),
      };
      socket.emit('state:snapshot', snapshot);
      return { ok: true, data: snapshot };
    },
    deps.log,
  );

  /**
   * Uma chamada literal por comando, e não um laço sobre a lista.
   *
   * Num laço, `K` colapsa na união de todos os comandos: `CommandPayload<K>`
   * vira união de payloads, `TO_ACTION[nome]` vira união de funções, e o
   * TypeScript passa a exigir a interseção dos parâmetros. O jeito de calar o
   * compilador seria um `as` — que apaga exatamente a garantia pela qual a
   * tabela de tradução existe.
   */
  ligar(socket, 'game:placeSettlement', deps);
  ligar(socket, 'game:placeRoad', deps);
  ligar(socket, 'game:buildCity', deps);
  ligar(socket, 'game:rollDice', deps);
  ligar(socket, 'game:discard', deps);
  ligar(socket, 'game:moveRobber', deps);
  ligar(socket, 'game:buyDevCard', deps);
  ligar(socket, 'game:playDevCard', deps);
  ligar(socket, 'game:tradeBank', deps);
  ligar(socket, 'game:tradeOffer', deps);
  ligar(socket, 'game:tradeRespond', deps);
  ligar(socket, 'game:tradeConfirm', deps);
  ligar(socket, 'game:endTurn', deps);
}

/**
 * `game:error` foi aposentado na Fase 5, pelo motivo que a Fase 4 já tinha
 * anotado: **o ack é a resposta autoritativa**, e o cliente nunca assinou o
 * evento. Dois caminhos para o mesmo alerta são duas chances de o jogador ver
 * duas vezes o que aconteceu uma — e uma delas chegando fora de ordem em
 * relação à outra. Mesmo destino do `game:event`, pelo mesmo raciocínio.
 */
function ligar<K extends GameCommandName>(socket: GameSocket, name: K, deps: GameDeps): void {
  handle(
    socket,
    name,
    async (payload, playerId: PlayerId, requestId) => {
      const room = deps.rooms.byPlayer(playerId);
      if (room === undefined) return { ok: false, error: 'NOT_IN_ROOM' };

      // `ROOM_NOT_STARTED` estava declarado desde a M2 e nunca tinha usuário:
      // é este. Jogar antes do `room:start` não é jogada inválida, é sala que
      // ainda não virou partida.
      if (room.game === null) return { ok: false, error: 'ROOM_NOT_STARTED' };

      return aplicarJogada(deps, room, playerId, requestId, toAction(name, payload, playerId));
    },
    deps.log,
  );
}
