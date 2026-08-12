/**
 * Sobe um servidor de verdade numa porta efêmera e devolve o endereço.
 *
 * Porta efêmera em vez de fixa porque os arquivos de teste compartilham a
 * máquina do CI; porta fixa transforma dois testes simultâneos num
 * `EADDRINUSE` intermitente, que é o pior tipo de teste vermelho.
 */

import { io as connect, type Socket } from 'socket.io-client';

import { buildServer, type AppServer } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';

export type TestServer = {
  server: AppServer;
  url: string;
  connect(): Promise<Socket>;
  close(): Promise<void>;
};

export async function startTestServer(): Promise<TestServer> {
  const config = loadConfig({
    PORT: '0',
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
  });

  const server = buildServer(config);
  const { port } = await server.listen();
  const url = `http://127.0.0.1:${port}`;

  const clientes: Socket[] = [];

  return {
    server,
    url,

    async connect(): Promise<Socket> {
      const socket = connect(url, { transports: ['websocket'], reconnection: false });
      clientes.push(socket);

      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => {
          resolve();
        });
        socket.once('connect_error', (erro) => {
          reject(erro instanceof Error ? erro : new Error(String(erro)));
        });
      });

      return socket;
    },

    async close(): Promise<void> {
      for (const socket of clientes) socket.disconnect();
      await server.close();
    },
  };
}
