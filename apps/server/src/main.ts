/**
 * Ponto de entrada. Tudo que é I/O de processo — ambiente, sinais, código de
 * saída — mora aqui, e só aqui.
 */

import { buildServer } from './app.js';
import { loadConfig } from './config.js';
import { PostgresStore } from './persistence/postgres.js';
import { NullStore, type Store } from './persistence/store.js';

const config = loadConfig();

/**
 * A conexão é aberta antes do servidor porque a migração roda aqui: subir e
 * começar a aceitar jogadas contra um esquema desatualizado seria pior do que
 * não subir.
 */
const store: Store =
  config.DATABASE_URL === undefined
    ? new NullStore()
    : await PostgresStore.connect({ url: config.DATABASE_URL });

const server = buildServer(config, { store });

async function shutdown(signal: string): Promise<void> {
  server.fastify.log.info({ signal }, 'encerrando');
  try {
    await server.close();
    await store.close();
    process.exit(0);
  } catch (erro) {
    server.fastify.log.error({ erro }, 'falha ao encerrar');
    process.exit(1);
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

try {
  const { host, port } = await server.listen();
  server.fastify.log.info(
    { host, port, env: config.NODE_ENV, persistencia: config.DATABASE_URL !== undefined },
    'ilhavera no ar',
  );
  if (config.DATABASE_URL === undefined) {
    server.fastify.log.warn('sem DATABASE_URL: as partidas não sobrevivem a um reinício');
  }
} catch (erro) {
  server.fastify.log.error({ erro }, 'falha ao subir');
  process.exit(1);
}
