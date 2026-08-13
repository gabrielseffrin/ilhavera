/**
 * @ilhavera/rules — motor de regras puro e determinístico.
 *
 * Regra de dependência (§6.3): este pacote não importa nada de `apps/`, nem
 * APIs de Node, nem bibliotecas de I/O. É o mesmo código que roda como
 * AUTORIDADE no servidor e como PREVIEW no navegador — e, quando os dois
 * discordam, o servidor sempre vence.
 */

export * from './types.js';
export * from './errors.js';
export * from './labels.js';
export * from './narrate.js';
export * from './state.js';
export * from './query.js';
export * from './legal.js';
export * from './view.js';
export * from './game.js';
export * from './reduce.js';

export * from './actions/types.js';
export { HANDLERS } from './actions/index.js';

export * from './board/coords.js';
export * from './board/graph.js';
export * from './board/generate.js';

export * from './scoring/longestRoad.js';
export * from './scoring/victory.js';

export * as rng from './rng.js';
