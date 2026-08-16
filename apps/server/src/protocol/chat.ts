/**
 * `chat:send` e `chat:message` — a conversa da sala (§5.1 e §5.2).
 *
 * Declarados no contrato desde a Fase 2 e sem handler até aqui. Quatro amigos
 * jogando sem poder falar é metade do que se combinou entregar, e o aceite desta
 * fase é justamente "quatro jogadores sem precisar de explicação".
 *
 * ## Por que este é o único broadcast de sala do servidor
 *
 * `game.ts` avisa, em letras grandes, que estado de partida **nunca** sai por
 * `io.to(code)`: cada jogador vê uma partida diferente, e um broadcast do estado
 * cru entregaria a mão alheia a todo mundo. Chat é o caso oposto e o único: a
 * mensagem é a mesma para todos por definição, e mandá-la jogador a jogador
 * seria cerimônia sem ganho — a informação não é filtrável porque não há nada a
 * filtrar.
 *
 * ## O que não está aqui
 *
 * **Persistência.** §7 não tem tabela de chat, e não ganhou uma: quem entra
 * depois não vê o que passou. É decisão, não esquecimento — guardar conversa
 * significa decidir por quanto tempo, quem pode ler no replay e o que fazer com
 * ela quando a sala morre, e nada disso é problema do MVP.
 *
 * **Limite de ritmo próprio.** O balde por socket de `handle` já cobre: quem
 * inunda o chat inunda o mesmo balde que gasta para jogar, e leva `RATE_LIMITED`
 * pelo caminho que já existe.
 */

import type { FastifyBaseLogger } from 'fastify';

import type { RoomRegistry } from '../rooms/registry.js';
import { handle } from './handle.js';
import type { GameServer, GameSocket } from './types.js';

export type ChatDeps = {
  io: GameServer;
  rooms: RoomRegistry;
  log: FastifyBaseLogger;
  /** Injetável pelo mesmo motivo do relógio do `RoomRegistry`: teste estável. */
  now?: () => number;
};

export function registerChatCommands(socket: GameSocket, deps: ChatDeps): void {
  const { io, rooms, log } = deps;
  const now = deps.now ?? Date.now;

  handle(
    socket,
    'chat:send',
    (payload, playerId) => {
      const room = rooms.byPlayer(playerId);
      if (room === undefined) return { ok: false, error: 'NOT_IN_ROOM' };

      /**
       * O apelido vem do **assento**, e não do `PlayerDirectory`.
       *
       * É o mesmo cuidado que a restauração de salas documenta: o assento
       * guarda o nome com que a pessoa entrou *nesta* sala, que é o que os
       * outros estão lendo no tabuleiro. Trocar o apelido global no meio de uma
       * partida não pode fazer as falas antigas mudarem de dono na cabeça de
       * quem lê.
       */
      const assento = room.seats.find((s) => s.playerId === playerId);
      if (assento === undefined) return { ok: false, error: 'NOT_IN_ROOM' };

      // O `text` já veio aparado e limitado a 500 pelo zod do contrato.
      io.to(room.code).emit('chat:message', {
        playerId,
        nickname: assento.nickname,
        text: payload.text,
        at: now(),
      });

      return { ok: true, data: undefined };
    },
    log,
  );
}
