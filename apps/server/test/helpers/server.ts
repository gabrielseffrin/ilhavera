/**
 * Sobe um servidor de verdade numa porta efêmera e devolve clientes prontos.
 *
 * Porta efêmera em vez de fixa porque os arquivos de teste compartilham a
 * máquina do CI; porta fixa transforma dois testes simultâneos num
 * `EADDRINUSE` intermitente, que é o pior tipo de teste vermelho.
 */

import { io as connect, type Socket } from 'socket.io-client';

import type { Ack, CommandName } from '@ilhavera/protocol';

import { buildServer, type AppServer, type BuildOptions } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';

/** Um cliente com açúcar para o padrão comando-com-ack da §5.1. */
export type Client = {
  socket: Socket;
  /** O token que o servidor emitiu no `session:issued`, se emitiu. */
  token: string | null;
  playerId: string | null;
  /**
   * O último `state:snapshot` recebido. Guardado porque o snapshot de
   * reconexão sai dentro do `connection` do servidor e chega antes de qualquer
   * `next()` que o teste consiga registrar depois do `connect`.
   */
  lastSnapshot: unknown;
  /** `requestId` explícito só quando o teste quer simular reenvio. */
  send<T = unknown>(
    command: CommandName,
    payload?: Record<string, unknown>,
    requestId?: string,
  ): Promise<Ack<T>>;
  /** Espera o próximo evento com esse nome, ou estoura o prazo. */
  next<T = unknown>(event: string, timeoutMs?: number): Promise<T>;
  disconnect(): void;
};

export type TestServer = {
  server: AppServer;
  url: string;
  connect(token?: string): Promise<Client>;
  close(): Promise<void>;
};

let contadorDeRequisicao = 0;

export async function startTestServer(options: BuildOptions = {}): Promise<TestServer> {
  const config = loadConfig({
    PORT: '0',
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
  });

  const server = buildServer(config, options);
  const { port } = await server.listen();
  const url = `http://127.0.0.1:${port}`;

  const clientes: Client[] = [];

  return {
    server,
    url,

    async connect(token?: string): Promise<Client> {
      const socket = connect(url, {
        transports: ['websocket'],
        reconnection: false,
        ...(token === undefined ? {} : { auth: { token } }),
      });

      const cliente: Client = {
        socket,
        token: null,
        playerId: null,
        lastSnapshot: null,

        async send<T = unknown>(
          command: CommandName,
          payload: Record<string, unknown> = {},
          requestIdExplicito?: string,
        ): Promise<Ack<T>> {
          const requestId = requestIdExplicito ?? `req-${++contadorDeRequisicao}`;
          return new Promise<Ack<T>>((resolve, reject) => {
            const prazo = setTimeout(() => {
              reject(new Error(`sem ack para ${command} em 3s`));
            }, 3000);

            socket.emit(command, { requestId, ...payload }, (resposta: Ack<T>) => {
              clearTimeout(prazo);
              resolve(resposta);
            });
          });
        },

        async next<T = unknown>(event: string, timeoutMs = 3000): Promise<T> {
          return new Promise<T>((resolve, reject) => {
            const prazo = setTimeout(() => {
              socket.off(event, aoReceber);
              reject(new Error(`evento ${event} não chegou em ${timeoutMs}ms`));
            }, timeoutMs);

            function aoReceber(dados: T): void {
              clearTimeout(prazo);
              resolve(dados);
            }

            socket.once(event, aoReceber);
          });
        },

        disconnect(): void {
          socket.disconnect();
        },
      };

      /**
       * Quem chega com token já tem identidade, e o servidor não reemite — o
       * `playerId` é a primeira parte do próprio token. Sem isto, todo cliente
       * reconectado ficaria sem saber quem é, e o teste não teria como achar o
       * jogador da vez.
       */
      if (token !== undefined) {
        const separador = token.indexOf('.');
        if (separador > 0) cliente.playerId = token.slice(0, separador);
      }

      // A identidade chega logo depois do connect, e só para quem é novo. Se
      // vier, corrige o palpite acima — foi token inválido.
      socket.on('session:issued', (dados: { playerId: string; token: string }) => {
        cliente.token = dados.token;
        cliente.playerId = dados.playerId;
      });

      socket.on('state:snapshot', (dados: unknown) => {
        cliente.lastSnapshot = dados;
      });

      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => {
          resolve();
        });
        socket.once('connect_error', (erro) => {
          reject(erro instanceof Error ? erro : new Error(String(erro)));
        });
      });

      // `session:issued` sai no mesmo tick do connect no servidor, mas chega no
      // cliente logo depois; um respiro evita teste sensível a ordem de rede.
      await new Promise((r) => setTimeout(r, 25));

      clientes.push(cliente);
      return cliente;
    },

    async close(): Promise<void> {
      for (const cliente of clientes) cliente.disconnect();
      await server.close();
    },
  };
}
