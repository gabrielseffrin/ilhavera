/**
 * Comandos `room:*` — o lobby na borda de rede (§5.1).
 *
 * Regra desta camada: **nada entra sem passar pelo zod** (`handle`), e nada sai
 * sem passar por uma função de projeção. Aqui a projeção é `toRoomView` — que
 * nunca leva `GameState` junto. Estado de partida sai por `game.ts`, e é de lá
 * que `room:start` toma emprestado o `emitSnapshot`.
 */

import type { FastifyBaseLogger } from 'fastify';

import type { PlayerDirectory } from '../identity/players.js';
import { toRoomView, type Room, type RoomRegistry } from '../rooms/registry.js';
import { emitSnapshot, emitSnapshotTo, type GameDeps } from './game.js';
import { handle } from './handle.js';
import type { GameServer, GameSocket } from './types.js';

export type RoomDeps = {
  io: GameServer;
  players: PlayerDirectory;
  rooms: RoomRegistry;
  log: FastifyBaseLogger;
  /** O relógio da sala, quando há. Ver `game/timer.ts`. */
  timer?: GameDeps['timer'];
};

/** O broadcast de sala. Nunca leva `GameState` junto — `RoomView` é o que sai. */
export function broadcastRoom(io: GameServer, room: Room): void {
  io.to(room.code).emit('room:updated', toRoomView(room));
}

export function registerRoomCommands(socket: GameSocket, deps: RoomDeps): void {
  const { io, players, rooms, log, timer } = deps;

  handle(
    socket,
    'room:create',
    (payload, playerId) => {
      const criada = rooms.create(playerId, payload.nickname, payload.settings);
      if (!criada.ok) return { ok: false, error: criada.error };

      players.setNickname(playerId, payload.nickname);
      void socket.join(criada.value.code);
      broadcastRoom(io, criada.value);

      return { ok: true, data: toRoomView(criada.value) };
    },
    log,
  );

  handle(
    socket,
    'room:join',
    (payload, playerId) => {
      const entrou = rooms.join(payload.code, playerId, payload.nickname);
      if (!entrou.ok) return { ok: false, error: entrou.error };

      players.setNickname(playerId, payload.nickname);
      void socket.join(entrou.value.code);
      broadcastRoom(io, entrou.value);

      /**
       * Reentrar numa partida em andamento devolve o tabuleiro.
       *
       * `registry.join` é idempotente para quem volta à própria sala, e uma
       * sala já iniciada **só** aceita quem já tem assento nela — as demais
       * caem em `ROOM_ALREADY_STARTED` antes de chegar aqui. Então isto vai
       * exatamente para quem tem direito ao estado, e é a mesma emissão que a
       * conexão faz em `connection.ts`. Sem ela, quem reentrasse ficaria numa
       * sala sem mesa, esperando um patch que só viria na jogada seguinte de
       * outra pessoa.
       *
       * Não precisa de guarda: `emitSnapshotTo` já ignora sala sem partida.
       */
      emitSnapshotTo(socket, entrou.value, timer);

      return { ok: true, data: toRoomView(entrou.value) };
    },
    log,
  );

  handle(
    socket,
    'room:leave',
    (_payload, playerId) => {
      const saiu = rooms.leave(playerId);
      if (!saiu.ok) return { ok: false, error: saiu.error };

      // Sala de lobby que sumiu não tem prazo a vencer.
      if (saiu.value.removed && saiu.value.room.game === null) {
        timer?.cancelar(saiu.value.room.code);
      }
      void socket.leave(saiu.value.room.code);
      broadcastRoom(io, saiu.value.room);

      return { ok: true, data: undefined };
    },
    log,
  );

  handle(
    socket,
    'room:setColor',
    (payload, playerId) => {
      const trocada = rooms.setColor(playerId, payload.color);
      if (!trocada.ok) return { ok: false, error: trocada.error };

      broadcastRoom(io, trocada.value);
      return { ok: true, data: toRoomView(trocada.value) };
    },
    log,
  );

  handle(
    socket,
    'room:start',
    (_payload, playerId) => {
      const iniciada = rooms.start(playerId);
      if (!iniciada.ok) return { ok: false, error: iniciada.error };

      broadcastRoom(io, iniciada.value);
      // O relógio começa a contar com a partida, e antes da emissão: o primeiro
      // snapshot já leva o prazo do primeiro turno.
      timer?.reagendar(iniciada.value);
      // O tabuleiro nasce aqui: cada um recebe a própria projeção da partida.
      emitSnapshot(io, iniciada.value, timer);

      return { ok: true, data: toRoomView(iniciada.value) };
    },
    log,
  );
}
