/**
 * Paleta do tabuleiro.
 *
 * Cores próprias, como manda §2 do roadmap: nada de reaproveitar a identidade
 * visual do jogo original. O critério aqui é distinguibilidade — os seis
 * terrenos precisam se separar à primeira vista, e as cores de jogador precisam
 * se separar entre si **e** dos terrenos, senão uma estrada some no fundo.
 */

import type { PlayerColor, Resource, Terrain } from '@ilhavera/rules';

export const COR_DO_TERRENO: Readonly<Record<Terrain, string>> = {
  forest: 'oklch(0.42 0.09 150)',
  hill: 'oklch(0.55 0.13 42)',
  pasture: 'oklch(0.80 0.12 132)',
  field: 'oklch(0.84 0.14 92)',
  mountain: 'oklch(0.58 0.03 265)',
  desert: 'oklch(0.86 0.05 88)',
};

/**
 * Preenchimento das peças. `white` vira um cinza-claro de propósito: branco puro
 * sobre o pasto claro fica invisível, e a cor do jogador precisa ser legível
 * antes de ser fiel ao nome.
 */
export const COR_DO_JOGADOR: Readonly<Record<PlayerColor, string>> = {
  red: 'oklch(0.55 0.21 25)',
  blue: 'oklch(0.50 0.17 255)',
  white: 'oklch(0.93 0.01 250)',
  orange: 'oklch(0.70 0.17 55)',
  green: 'oklch(0.60 0.16 145)',
  brown: 'oklch(0.42 0.07 55)',
};

/** Contorno das peças: escuro para as claras, claro para as escuras. */
export const CONTORNO_DO_JOGADOR: Readonly<Record<PlayerColor, string>> = {
  red: 'oklch(0.25 0.08 25)',
  blue: 'oklch(0.25 0.08 255)',
  white: 'oklch(0.35 0.01 250)',
  orange: 'oklch(0.35 0.10 55)',
  green: 'oklch(0.28 0.08 145)',
  brown: 'oklch(0.22 0.04 55)',
};

export const COR_DO_MAR = 'oklch(0.62 0.13 236)';

/**
 * Cor de cada recurso na mão e nos modais.
 *
 * Aponta para as variáveis declaradas em `index.css` em vez de repetir os
 * valores: um recurso tem uma cor só no projeto inteiro, e duas listas de
 * oklch em arquivos diferentes divergem no primeiro ajuste de contraste.
 */
export const COR_DO_RECURSO: Readonly<Record<Resource, string>> = {
  lumber: 'var(--color-madeira)',
  brick: 'var(--color-tijolo)',
  wool: 'var(--color-la)',
  grain: 'var(--color-trigo)',
  ore: 'var(--color-minerio)',
};

/**
 * 6 e 8 saem em vermelho porque são os números mais prováveis — é informação de
 * jogo, não enfeite: quem escolhe onde assentar precisa vê-los de longe.
 */
export function corDaFicha(numero: number): string {
  return numero === 6 || numero === 8 ? 'oklch(0.50 0.20 27)' : 'oklch(0.25 0.01 260)';
}

/**
 * Quantas das 36 combinações de 2d6 dão este número. Vira os pontinhos embaixo
 * da ficha, que é como se lê a probabilidade sem fazer conta.
 */
export function pontosDeProbabilidade(numero: number): number {
  return 6 - Math.abs(7 - numero);
}
