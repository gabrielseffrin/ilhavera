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
import { emitSnapshotTo, registerGameCommands } from './game.js';
import { RateLimiter, type RateLimitOptions } from './rate-limit.js';
import { broadcastRoom, registerRoomCommands } from './rooms.js';
import type { GameServer } from './types.js';

export type HandlerDeps = {
  players: PlayerDirectory;
  rooms: RoomRegistry;
  log: FastifyBaseLogger;
  rateLimit: RateLimitOptions;
};

export function registerHandlers(io: GameServer, deps: HandlerDeps): void {
  const { players, rooms, log, rateLimit } = deps;

  /**
   * Handshake: quem chega com token válido volta a ser quem era; quem chega sem
   * token ganha uma identidade nova. Token inválido **não** derruba a conexão —
   * cai no mesmo caminho de "primeira vez", porque a alternativa é um cliente
   * com `localStorage` velho preso para fora sem saber por quê.
   */
  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.['token'];
    const conhecido = players.verify(token);

    // Um balde por conexão, criado aqui: nasce e morre com o socket, então não
    // há mapa global de limites para alguém esquecer de limpar.
    const limiter = new RateLimiter(rateLimit);

    if (conhecido !== null) {
      socket.data = { playerId: conhecido, limiter };
    } else {
      const nova = players.issue();
      socket.data = { playerId: nova.id, issuedToken: nova.token, limiter };
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

    /**
     * Sala privada do jogador, usada para endereçar `state:snapshot` e
     * `state:patch` — cada um vê uma partida diferente, então o estado nunca
     * sai por `io.to(code)`. Endereçar o jogador em vez do socket resolve as
     * duas abas abertas de graça. Antes de qualquer emissão: com o adapter em
     * memória o `join` é síncrono, mas a ordem passa a importar quando o
     * adapter Redis entrar.
     */
    void socket.join(dados.playerId);

    // Reconexão: quem já tinha assento volta para ele sem precisar de comando.
    const anterior = rooms.byPlayer(dados.playerId);
    if (anterior !== undefined) {
      void socket.join(anterior.code);
      rooms.setConnected(dados.playerId, true);
      broadcastRoom(io, anterior);
      // Quem volta no meio de uma partida precisa do estado inteiro; os outros
      // já o têm, então isto vai só para esta conexão.
      emitSnapshotTo(socket, anterior);
    }

    log.debug({ socketId: socket.id, playerId: dados.playerId }, 'socket conectado');

    registerRoomCommands(socket, { io, players, rooms, log });
    registerGameCommands(socket, { io, rooms, log });

    socket.on('disconnect', (reason) => {
      const room = rooms.setConnected(dados.playerId, false);
      if (room !== undefined) broadcastRoom(io, room);
      log.debug({ socketId: socket.id, playerId: dados.playerId, reason }, 'socket desconectado');
    });
  });
}
