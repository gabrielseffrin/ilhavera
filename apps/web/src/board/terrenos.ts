/**
 * A marca d'água de cada terreno.
 *
 * Antes disto um hexágono era um polígono de tinta chapada, e a única forma de
 * saber que aquele verde era Floresta e não Pasto era o matiz — o mesmo sinal
 * único que a M3 da Fase 5 recusou para os jogadores quando deu a cada um uma
 * **forma** própria. Aqui vale o mesmo: cor é o primeiro sinal, nunca o único.
 *
 * O desenho é o **do recurso que o terreno produz**, ligado por
 * `TERRAIN_PRODUCES`. Reaproveitar em vez de desenhar um segundo conjunto tem
 * dois ganhos: a pessoa aprende um símbolo e o reconhece na mesa e na mão, e não
 * há como os dois divergirem, porque só existe um traçado.
 *
 * O Deserto é a exceção — não produz nada, então não há recurso a espelhar, e
 * ele ganha dunas próprias. Marca d'água nenhuma seria pior: o vazio se lê como
 * "esqueceram deste" em vez de "este não produz".
 */

import { TERRAINS, TERRAIN_PRODUCES, type Terrain } from '@ilhavera/rules';

import { CAMINHO_DO_RECURSO } from '../hud/icones/IconeDeRecurso.js';

/** Dunas: duas cristas cheias, porque a marca d'água é preenchida e não traçada. */
const DUNAS =
  'M2 18c3-5 5-5 8 0 3 5 5 5 8 0v4H2ZM3 11c2.5-4 4.5-4 7 0 2.5 4 4.5 4 7 0v3c-2.5 4-4.5 4-7 0-2.5-4-4.5-4-7 0Z';

/**
 * Derivado de `TERRAIN_PRODUCES`, e não copiado dele.
 *
 * Uma segunda lista escrita à mão diria a mesma coisa hoje e divergiria no dia
 * em que a §3.1 mudasse — com o agravante de que a divergência seria silenciosa:
 * o hexágono mostraria trigo e produziria minério, e nenhum teste reclamaria.
 * Assim o desenho **é** o recurso que o motor diz que sai dali.
 */
export const CAMINHO_DO_TERRENO: Readonly<Record<Terrain, string>> = Object.fromEntries(
  TERRAINS.map((terreno) => {
    const recurso = TERRAIN_PRODUCES[terreno];
    return [terreno, recurso === null ? DUNAS : CAMINHO_DO_RECURSO[recurso]];
  }),
) as Record<Terrain, string>;

/**
 * A tinta da marca d'água, por terreno.
 *
 * Uma cor só não serve: tinta escura some na Floresta, tinta clara some no
 * Deserto. A direção do contraste segue a luminosidade do terreno — claro sobre
 * escuro, escuro sobre claro. O alfa é baixo de propósito: isto é textura, e o
 * que não pode piorar é o contraste da **ficha numérica**, que é o número que
 * decide a jogada.
 */
export const TINTA_DO_TERRENO: Readonly<Record<Terrain, string>> = {
  forest: 'oklch(0.96 0.03 150 / 0.24)',
  hill: 'oklch(0.97 0.03 40 / 0.26)',
  pasture: 'oklch(0.30 0.06 140 / 0.22)',
  field: 'oklch(0.32 0.08 95 / 0.22)',
  mountain: 'oklch(0.96 0.01 265 / 0.26)',
  desert: 'oklch(0.48 0.04 80 / 0.26)',
};
