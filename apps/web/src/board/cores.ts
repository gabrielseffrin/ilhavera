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

/**
 * A marca de cada jogador — cor **e** forma.
 *
 * Seis cores distinguíveis por todo mundo é matematicamente apertado, e esta
 * paleta tem `red` e `green`, que é a dupla clássica da deuteranopia. Dá para
 * escolher seis matizes seguros; não dá para escolher seis matizes seguros que
 * também se separem dos seis terrenos e do mar.
 *
 * A saída é não depender de cor sozinha. Cada jogador ganha uma forma própria,
 * desenhada dentro da peça e repetida em toda lista de jogadores. Não é um modo
 * alternativo que alguém precisa descobrir e ligar: está sempre ligado, não
 * custa nada a quem enxerga cor, e ajuda todo mundo a achar as próprias peças
 * num tabuleiro cheio.
 *
 * Mora aqui, ao lado de `COR_DO_JOGADOR`, pela mesma razão que
 * `CONTORNO_DO_JOGADOR` mora: uma cor nova sem marca precisa doer num lugar só.
 */
export type MarcaDeJogador = 'ponto' | 'barra' | 'traco' | 'cruz' | 'triangulo' | 'losango';

export const MARCA_DO_JOGADOR: Readonly<Record<PlayerColor, MarcaDeJogador>> = {
  red: 'ponto',
  blue: 'barra',
  white: 'traco',
  orange: 'cruz',
  green: 'triangulo',
  brown: 'losango',
};

/**
 * O nome da cor em português.
 *
 * `PlayerColor` é `'red' | 'blue' | …` porque identificador de domínio não se
 * traduz (ver `labels.ts` no motor, mesma separação). Mas um `aria-label="red"`
 * faz o leitor de tela soletrar em inglês no meio de uma frase em português.
 */
export const NOME_DA_COR: Readonly<Record<PlayerColor, string>> = {
  red: 'vermelho',
  blue: 'azul',
  white: 'branco',
  orange: 'laranja',
  green: 'verde',
  brown: 'marrom',
};

/** Como a marca se chama em voz alta — para `aria-label` e para a legenda. */
export const NOME_DA_MARCA: Readonly<Record<MarcaDeJogador, string>> = {
  ponto: 'ponto',
  barra: 'barra deitada',
  traco: 'barra em pé',
  cruz: 'cruz',
  triangulo: 'triângulo',
  losango: 'losango',
};

/**
 * O padrão do traço de cada estrada.
 *
 * Uma forma desenhada dentro de uma linha de 4px não se lê; o que distingue
 * linha de linha é o padrão do traço. Os valores são **múltiplos da largura do
 * traço**, e não pixels: o tabuleiro escala pelo `viewBox`, e um tracejado em
 * pixels viraria pontilhado num tamanho e sólido em outro.
 *
 * `red` é sólido de propósito — o padrão mais comum fica com a primeira cor, e
 * as outras se distinguem dele.
 */
export const TRACEJADO_DO_JOGADOR: Readonly<Record<PlayerColor, readonly number[] | null>> = {
  red: null,
  blue: [2.2, 1.1],
  white: [0.6, 0.9],
  orange: [2.6, 0.9, 0.6, 0.9],
  green: [4.5, 1.4],
  brown: [1.2, 1.2],
};

/** O `stroke-dasharray` já em unidades do desenho. */
export function tracejado(cor: PlayerColor, larguraDoTraco: number): string | undefined {
  const padrao = TRACEJADO_DO_JOGADOR[cor];
  return padrao === null ? undefined : padrao.map((n) => n * larguraDoTraco).join(' ');
}

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
