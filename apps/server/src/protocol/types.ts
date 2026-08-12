/**
 * Tipagem dos mapas de evento do Socket.IO a partir do contrato de
 * `@ilhavera/protocol`.
 *
 * Sem isto, `socket.on(nome)` com `nome` genérico esbarra nos eventos
 * reservados da biblioteca (`disconnect`, `error`) e o TypeScript desiste. Com
 * isto, o servidor só consegue escutar comando que existe na §5.1 e só consegue
 * emitir evento que existe na §5.2 — o contrato passa a ser verificado no
 * compilador, não na revisão.
 */

import type { Server as IOServer, Socket } from 'socket.io';

import type { Ack, CommandName, ServerEventName } from '@ilhavera/protocol';

import type { PlayerId } from '../identity/players.js';

/** O `ack` é opcional em tempo de execução: um cliente pode disparar e esquecer. */
export type ClientToServerEvents = Record<
  CommandName,
  (payload: unknown, ack?: (resposta: Ack<unknown>) => void) => void
>;

export type ServerToClientEvents = Record<ServerEventName, (payload: unknown) => void>;

/** Vazio até a Fase 2 do backlog, quando o adapter Redis liga os nós. */
export type InterServerEvents = Record<string, never>;

export type SessionData = {
  playerId: PlayerId;
  /** Presente só na conexão que acabou de ganhar identidade nova. */
  issuedToken?: string;
};

export type GameServer = IOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SessionData
>;

export type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SessionData
>;
