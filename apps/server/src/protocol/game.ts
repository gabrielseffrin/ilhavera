/**
 * Comandos `game:*` — a jogada chegando ao motor (§5.1).
 *
 * O caminho de todo comando é sempre o mesmo: `handle` valida o envelope e o
 * payload, `toAction` traduz para o vocabulário do motor, e o `GameRoom` da sala
 * aplica atrás da fila. O servidor não decide nada de regra: quem aceita ou
 * recusa é o `reduce`, e a resposta dele vai direto para o ack.
 */

import type { FastifyBaseLogger } from 'fastify';

import { toAction, type GameCommandName } from '@ilhavera/protocol';

import type { PlayerId } from '../identity/players.js';
import type { RoomRegistry } from '../rooms/registry.js';
import { handle } from './handle.js';
import type { GameSocket } from './types.js';

export type GameDeps = {
  rooms: RoomRegistry;
  log: FastifyBaseLogger;
};

export function registerGameCommands(socket: GameSocket, deps: GameDeps): void {
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
  const { rooms, log } = deps;

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

      const { ack, applied, events } = await game.submit({
        playerId,
        requestId,
        action: toAction(name, payload, playerId),
      });

      if (applied) {
        log.debug(
          { code: room.code, comando: name, eventos: events.map((e) => e.type) },
          'jogada aplicada',
        );
      }

      return ack;
    },
    log,
  );
}
