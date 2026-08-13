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
import type { GameEvent } from '@ilhavera/rules';

import type { PlayerId } from '../identity/players.js';
import type { Room, RoomRegistry } from '../rooms/registry.js';
import { handle } from './handle.js';
import type { GameServer, GameSocket } from './types.js';

export type GameDeps = {
  io: GameServer;
  rooms: RoomRegistry;
  log: FastifyBaseLogger;
};

/**
 * Estado completo, um por jogador (§5.2: "enviado ao entrar e ao reconectar").
 *
 * O endereço é a sala privada de cada `playerId`, e não o socket: quem abriu
 * duas abas tem duas conexões e as duas precisam do mesmo estado.
 */
export function emitSnapshot(io: GameServer, room: Room): void {
  const game = room.game;
  if (game === null) return;

  for (const seat of room.seats) {
    io.to(seat.playerId).emit('state:snapshot', game.view(seat.playerId));
  }
}

/** Snapshot para uma conexão só — o caso da reconexão. */
export function emitSnapshotTo(socket: GameSocket, room: Room): void {
  const game = room.game;
  if (game === null) return;

  socket.emit('state:snapshot', game.view(socket.data.playerId));
}

/**
 * O delta de uma jogada (§5.2). `version` vai junto porque é ela que deixa o
 * cliente perceber que perdeu um patch e pedir `state:resync` — a "regra de
 * consistência" de §5.2.
 */
export function emitPatch(io: GameServer, room: Room, events: readonly GameEvent[]): void {
  const game = room.game;
  if (game === null) return;

  const version = game.version;
  for (const seat of room.seats) {
    io.to(seat.playerId).emit('state:patch', {
      version,
      events: game.patchFor(events, seat.playerId),
    });
  }
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

      const view = room.game.view(playerId);
      socket.emit('state:snapshot', view);
      return { ok: true, data: view };
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

function ligar<K extends GameCommandName>(socket: GameSocket, name: K, deps: GameDeps): void {
  const { io, rooms, log } = deps;

  handle(
    socket,
    name,
    async (payload, playerId: PlayerId, requestId) => {
      const room = rooms.byPlayer(playerId);
      if (room === undefined) return { ok: false, error: 'NOT_IN_ROOM' };

      const game = room.game;
      // `ROOM_NOT_STARTED` estava declarado desde a M2 e nunca tinha usuário:
      // é este. Jogar antes do `room:start` não é jogada inválida, é sala que
      // ainda não virou partida.
      if (game === null) return { ok: false, error: 'ROOM_NOT_STARTED' };

      const { ack, applied, deduped, events } = await game.submit({
        playerId,
        requestId,
        action: toAction(name, payload, playerId),
      });

      if (applied) {
        log.debug(
          { code: room.code, comando: name, eventos: events.map((e) => e.type) },
          'jogada aplicada',
        );
        emitPatch(io, room, events);
      } else if (!ack.ok && !deduped) {
        /**
         * Redundante com o ack de propósito. O ack é a resposta autoritativa,
         * mas o store do cliente assina um fluxo de eventos; sem isto, cada
         * ponto de chamada teria que costurar a própria rejeição no log da
         * interface. Vai só para quem enviou — errar não é notícia de mesa.
         *
         * Reenvio deduplicado não passa por aqui: o `ack` repetido já é a
         * resposta, e reemitir o erro faria a interface avisar duas vezes de
         * uma coisa que aconteceu uma vez.
         */
        socket.emit('game:error', { requestId, code: ack.error });
      }

      return ack;
    },
    log,
  );
}
