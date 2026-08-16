/**
 * Monta o servidor: Fastify para HTTP, Socket.IO para a partida.
 *
 * Nada de regra de jogo aqui: o motor vive no `GameRoom` de cada sala, atrás da
 * fila, e só é alcançado pelos comandos de `protocol/game.ts`.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { Server as IOServer } from 'socket.io';

import type { Config } from './config.js';
import { INTERVALO_DA_VARREDURA, TurnTimer } from './game/timer.js';
import { PlayerDirectory } from './identity/players.js';
import { NullStore, WriteQueue, type Store } from './persistence/store.js';
import { registerHandlers } from './protocol/connection.js';
import { aplicarJogada } from './protocol/game.js';
import type { GameServer } from './protocol/types.js';
import { RoomRegistry, type RoomRegistryOptions } from './rooms/registry.js';

export type Address = { host: string; port: number };

export type AppServer = {
  readonly fastify: FastifyInstance;
  readonly io: GameServer;
  readonly players: PlayerDirectory;
  readonly rooms: RoomRegistry;
  /** O relógio de turno. Exposto para o teste poder adiantá-lo sem esperar. */
  readonly timer: TurnTimer;
  /** Sobe e devolve o endereço real — que difere do pedido quando `PORT` é 0. */
  listen(): Promise<Address>;
  /** Identidades e partidas em andamento de volta do banco. Chamado por `listen`. */
  restore(): Promise<void>;
  close(): Promise<void>;
};

export type BuildOptions = {
  /** Injetável para o teste fixar semente e relógio e obter partida reproduzível. */
  registry?: RoomRegistryOptions;
  /** Sem loja, o servidor sobe e joga — só não sobrevive ao próprio reinício. */
  store?: Store;
  /**
   * Relógio do timer de turno, injetável. O teste avança o tempo na mão e chama
   * `timer.tick()`, em vez de esperar trinta segundos de verdade.
   */
  now?: () => number;
  /**
   * Liga a varredura periódica. Desligada nos testes, que chamam `tick()`
   * diretamente — um `setInterval` vivo atravessaria o fim do caso e cutucaria
   * um servidor já fechado.
   */
  varrer?: boolean;
};

export function buildServer(config: Config, options: BuildOptions = {}): AppServer {
  const fastify = Fastify({
    logger: { level: config.LOG_LEVEL },
    /**
     * A Fase 6 põe Traefik/Caddy na frente. Sem isto, todo cliente chega com o
     * IP do proxy — e qualquer defesa por endereço mediria o proxy em vez da
     * pessoa. O limite da M7 é por socket e não depende disto; um limite por
     * IP, para conter quem abre mil conexões, depende.
     */
    trustProxy: true,
    /**
     * Uma conexão de WebSocket nunca fica ociosa, então o `'idle'` padrão faz
     * `close()` esperar para sempre por ela. Num servidor de jogo isso não é
     * detalhe de teste: é o processo que não morre no deploy e trava o rollback.
     */
    forceCloseConnections: true,
  });

  const io: GameServer = new IOServer(fastify.server, {
    serveClient: false,
    cors: { origin: config.CORS_ORIGIN },
  });

  const store = options.store ?? new NullStore();
  const writes = new WriteQueue();
  const onWriteError = (erro: unknown, contexto: string): void => {
    // A gravação falhou, o jogo continua. Perder a partida inteira porque o
    // banco piscou seria pior do que perder o diário dela.
    fastify.log.error({ err: erro, operacao: contexto }, 'falha ao gravar');
  };

  const players = new PlayerDirectory({ store, onWriteError });
  const rooms = new RoomRegistry({ store, writes, onWriteError, ...options.registry });

  /**
   * A raiz existe para quem abre `localhost:3000` no navegador e precisa
   * descobrir o que este processo é. Sem ela, a primeira coisa que o projeto
   * mostra a alguém é um 404 cru — e o cliente de verdade só chega na Fase 3.
   */
  fastify.get('/', () => ({
    service: 'ilhavera',
    message: 'Servidor de jogo. A partida acontece por WebSocket, não por HTTP.',
    endpoints: {
      health: '/health',
      socket: '/socket.io/',
    },
  }));

  fastify.get('/health', () => ({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    sockets: io.engine.clientsCount,
    rooms: rooms.size,
  }));

  /**
   * O relógio de turno. Só faz alguma coisa em sala com `turnSeconds`, que é
   * `null` por padrão — então numa instalação normal ele existe e nunca dispara.
   *
   * `jogar` é injetado com o mesmo `aplicarJogada` da borda de socket: a jogada
   * automática percorre a fila, a idempotência, a persistência e a emissão que
   * qualquer jogada humana percorre. Nada aqui é atalho.
   */
  const timer: TurnTimer = new TurnTimer({
    rooms,
    log: fastify.log,
    ...(options.now === undefined ? {} : { now: options.now }),
    jogar: async (room, playerId, action) => {
      await aplicarJogada(
        { io, rooms, log: fastify.log, timer },
        room,
        playerId,
        timer.proximoRequestId(),
        action,
      );
    },
  });

  const varredura =
    options.varrer === false
      ? null
      : setInterval(() => {
          void timer.tick();
        }, INTERVALO_DA_VARREDURA);
  // Sem isto, um servidor ocioso segura o processo Node vivo só por causa da
  // varredura — e o `pnpm dev` deixa de encerrar com Ctrl+C.
  varredura?.unref();

  registerHandlers(io, {
    players,
    rooms,
    log: fastify.log,
    rateLimit: {
      capacity: config.RATE_LIMIT_BURST,
      refillPerSecond: config.RATE_LIMIT_PER_SECOND,
    },
    timer,
  });

  /** Rede de segurança para quem chamar `fastify.close()` sem passar por `close()`. */
  fastify.addHook('onClose', (_instance, done) => {
    io.local.disconnectSockets(true);
    io.engine.close();
    done();
  });

  return {
    fastify,
    io,
    players,
    rooms,
    timer,

    async restore(): Promise<void> {
      await players.restore();
      const quantas = await rooms.restore((roomId, motivo) => {
        fastify.log.error({ roomId, motivo }, 'sala não pôde ser restaurada');
      });
      if (quantas > 0) fastify.log.info({ salas: quantas }, 'partidas restauradas');
    },

    async listen(): Promise<Address> {
      /**
       * Antes de aceitar conexão, não depois: um cliente que reconecta no
       * milissegundo seguinte ao `listen` precisa encontrar o assento dele já
       * no lugar, senão vira visitante novo e perde a partida.
       */
      await this.restore();
      await fastify.listen({ port: config.PORT, host: config.HOST });

      const address = fastify.server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('servidor subiu sem endereço TCP');
      }
      return { host: address.address, port: address.port };
    },

    async close(): Promise<void> {
      // Antes de `fastify.close()`, não dentro do hook: quando o hook roda, o
      // servidor HTTP já está drenando e a conexão aberta já o está segurando.
      if (varredura !== null) clearInterval(varredura);
      io.local.disconnectSockets(true);
      io.engine.close();
      await fastify.close();
    },
  };
}
