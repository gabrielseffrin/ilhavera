/**
 * Ponto de entrada. Tudo que é I/O de processo — ambiente, sinais, código de
 * saída — mora aqui, e só aqui.
 */

import { buildServer } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const server = buildServer(config);

async function shutdown(signal: string): Promise<void> {
  server.fastify.log.info({ signal }, 'encerrando');
  try {
    await server.close();
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
  server.fastify.log.info({ host, port, env: config.NODE_ENV }, 'ilhavera no ar');
} catch (erro) {
  server.fastify.log.error({ erro }, 'falha ao subir');
  process.exit(1);
}
