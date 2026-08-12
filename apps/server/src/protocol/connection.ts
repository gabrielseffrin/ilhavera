/**
 * O ciclo de vida da conexão: quem é quem, e o que acontece ao chegar e ao sair.
 *
 * Os comandos em si moram nos módulos por família (`rooms.ts`, `game.ts`);
 * aqui fica só o que é da conexão, para que a ordem das coisas na chegada —
 * identidade, salas do Socket.IO, só então handlers — esteja num lugar só.
 */

import type { FastifyBaseLogger } from 'fastify';

import type { PlayerDirectory } from '../identity/players.js';
import type { RoomRegistry } from '../rooms/registry.js';
import { broadcastRoom, registerRoomCommands } from './rooms.js';
import type { GameServer } from './types.js';

export type HandlerDeps = {
  players: PlayerDirectory;
  rooms: RoomRegistry;
  log: FastifyBaseLogger;
};

export function registerHandlers(io: GameServer, deps: HandlerDeps): void {
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
      broadcastRoom(io, anterior);
    }

    log.debug({ socketId: socket.id, playerId: dados.playerId }, 'socket conectado');

    registerRoomCommands(socket, { io, players, rooms, log });

    socket.on('disconnect', (reason) => {
      const room = rooms.setConnected(dados.playerId, false);
      if (room !== undefined) broadcastRoom(io, room);
      log.debug({ socketId: socket.id, playerId: dados.playerId, reason }, 'socket desconectado');
    });
  });
}
