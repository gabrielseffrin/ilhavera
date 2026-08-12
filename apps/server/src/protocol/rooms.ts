/**
 * Borda de rede das salas — §5.1 dos comandos `room:*`.
 *
 * Regra desta camada: **nada entra sem passar pelo zod**, e nada sai sem passar
 * por uma função de projeção. Aqui só existe `toRoomView`; a partir da M4, todo
 * estado de partida sai por `toClientView`, e este módulo é o único lugar do
 * servidor autorizado a emitir estado.
 */

import type { FastifyBaseLogger } from 'fastify';

import {
  ENVELOPE,
  parseCommand,
  type Ack,
  type CommandName,
  type CommandPayload,
} from '@ilhavera/protocol';

import type { PlayerDirectory, PlayerId } from '../identity/players.js';
import { toRoomView, type Room, type RoomRegistry } from '../rooms/registry.js';
import type { GameServer, GameSocket } from './types.js';

export type RoomDeps = {
  players: PlayerDirectory;
  rooms: RoomRegistry;
  log: FastifyBaseLogger;
};

export function registerRoomHandlers(io: GameServer, deps: RoomDeps): void {
  const { players, rooms, log } = deps;

  /**
   * Handshake: quem chega com token válido volta a ser quem era; quem chega sem
   * token ganha uma identidade nova. Token inválido **não** derruba a conexão —
   * cai no mesmo caminho de "primeira vez", porque a alternativa é um cliente
   * com `localStorage` velho preso para fora sem saber por quê.
   */
  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.['token'];
    const conhecido = players.verify(token);

    if (conhecido !== null) {
      socket.data = { playerId: conhecido };
    } else {
      const nova = players.issue();
      socket.data = { playerId: nova.id, issuedToken: nova.token };
    }
    next();
  });

  function broadcast(room: Room): void {
    io.to(room.code).emit('room:updated', toRoomView(room));
  }

  io.on('connection', (socket) => {
    const dados = socket.data;

    if (dados.issuedToken !== undefined) {
      socket.emit('session:issued', { playerId: dados.playerId, token: dados.issuedToken });
      // Só na conexão que a criou: reemitir a cada reconexão daria a impressão
      // ao cliente de que a identidade mudou.
      delete dados.issuedToken;
    }

    // Reconexão: quem já tinha assento volta para ele sem precisar de comando.
    const anterior = rooms.byPlayer(dados.playerId);
    if (anterior !== undefined) {
      void socket.join(anterior.code);
      rooms.setConnected(dados.playerId, true);
      broadcast(anterior);
    }

    log.debug({ socketId: socket.id, playerId: dados.playerId }, 'socket conectado');

    handle(socket, 'room:create', (payload, playerId) => {
      const criada = rooms.create(playerId, payload.nickname, payload.settings);
      if (!criada.ok) return { ok: false, error: criada.error };

      players.setNickname(playerId, payload.nickname);
      void socket.join(criada.value.code);
      broadcast(criada.value);

      return { ok: true, data: toRoomView(criada.value) };
    });

    handle(socket, 'room:join', (payload, playerId) => {
      const entrou = rooms.join(payload.code, playerId, payload.nickname);
      if (!entrou.ok) return { ok: false, error: entrou.error };

      players.setNickname(playerId, payload.nickname);
      void socket.join(entrou.value.code);
      broadcast(entrou.value);

      return { ok: true, data: toRoomView(entrou.value) };
    });

    handle(socket, 'room:leave', (_payload, playerId) => {
      const saiu = rooms.leave(playerId);
      if (!saiu.ok) return { ok: false, error: saiu.error };

      void socket.leave(saiu.value.room.code);
      broadcast(saiu.value.room);

      return { ok: true, data: undefined };
    });

    handle(socket, 'room:start', (_payload, playerId) => {
      const iniciada = rooms.start(playerId);
      if (!iniciada.ok) return { ok: false, error: iniciada.error };

      broadcast(iniciada.value);
      // O `state:snapshot` da partida entra na M4, junto com a projeção.
      return { ok: true, data: toRoomView(iniciada.value) };
    });

    socket.on('disconnect', (reason) => {
      const room = rooms.setConnected(dados.playerId, false);
      if (room !== undefined) broadcast(room);
      log.debug({ socketId: socket.id, playerId: dados.playerId, reason }, 'socket desconectado');
    });
  });
}

/**
 * Liga um comando ao socket com a borda de validação e o `ack` da §5.1.
 *
 * O `requestId` é exigido desde já para que o contrato não mude depois; a
 * deduplicação de reenvio entra na M3, junto da fila por sala, que é onde ela
 * tem onde morar.
 */
function handle<K extends CommandName>(
  socket: GameSocket,
  name: K,
  run: (payload: CommandPayload<K>, playerId: PlayerId) => Ack<unknown>,
): void {
  type Ouvinte = (raw: unknown, ack?: (resposta: Ack<unknown>) => void) => void;

  const ouvinte: Ouvinte = (raw, ack) => {
    const responder = ack ?? ((): void => {});

    if (!ENVELOPE.safeParse(raw).success) {
      responder({ ok: false, error: 'BAD_PAYLOAD' });
      return;
    }

    const parsed = parseCommand(name, raw);
    if (!parsed.success) {
      responder({ ok: false, error: 'BAD_PAYLOAD' });
      return;
    }

    responder(run(parsed.data as CommandPayload<K>, socket.data.playerId));
  };

  /**
   * O tipo do `on` do Socket.IO é condicional sobre o nome do evento, e não
   * resolve enquanto `name` for genérico. `ClientToServerEvents` é um `Record`
   * uniforme sobre `CommandName`, então todo comando tem exatamente esta
   * assinatura — a asserção é segura e fica presa a esta linha.
   */
  (socket.on as (evento: K, escuta: Ouvinte) => void)(name, ouvinte);
}
