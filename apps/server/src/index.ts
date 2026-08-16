/**
 * A porta de entrada do pacote, para quem o importa em vez de rodá-lo.
 *
 * Hoje há um consumidor só: o aceite da Fase 4, em `apps/web`, que sobe um
 * servidor de verdade no mesmo processo e conecta clientes React nele. Sem isto
 * o teste teria que alcançar `src/` por caminho relativo através da fronteira de
 * dois pacotes — que funciona até o dia em que a estrutura de pastas mudar.
 *
 * `main.ts` continua sendo o executável. Aqui só se reexporta.
 */

export { buildServer, type Address, type AppServer, type BuildOptions } from './app.js';
export { loadConfig, type Config } from './config.js';
export type { Room, RoomRegistry } from './rooms/registry.js';
