/**
 * Configuração do servidor, lida do ambiente.
 *
 * `buildServer` recebe a `Config` pronta em vez de ler `process.env` por conta
 * própria. Parece cerimônia, mas é o que deixa o teste subir um servidor com
 * porta efêmera e log silencioso sem mexer em variável global — e o que torna
 * possível subir dois servidores no mesmo processo, coisa que o roteiro de
 * aceite da Fase 2 vai precisar quando matar um e levantar outro.
 */

import { z } from 'zod';

const ENV = z.object({
  /** `0` pede porta efêmera ao sistema. É o que os testes usam. */
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /**
   * Na Fase 3 o cliente Vite roda em outra origem (5173), e sem isto o
   * navegador recusa o handshake do Socket.IO sem dizer por quê.
   */
  CORS_ORIGIN: z.string().min(1).default('*'),
});

export type Config = z.infer<typeof ENV>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ENV.safeParse(env);
  if (!parsed.success) {
    const detalhe = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`configuração inválida — ${detalhe}`);
  }
  return parsed.data;
}
