/**
 * Os símbolos da HUD que eram caractere Unicode.
 *
 * `🂠 ✦ ⚔ ▶` funcionavam, e é justamente por isso que sobreviveram até aqui. O
 * problema deles não é feiúra: é que **cada sistema desenha um**, e alguns caem
 * para a fonte de emoji colorida, que ignora `color` e some do contraste que a
 * M3 mediu. Um `<path>` com `fill="currentColor"` tem um desenho só, herda a cor
 * do texto ao lado e escala com `font-size` nenhum — passa a ser conferível.
 *
 * A carta de recurso do painel de adversários é **genérica de propósito**: ali
 * só se sabe quantas cartas o outro tem, nunca quais. Trocar por cinco ícones de
 * recurso seria reabrir no navegador o vazamento que `toClientView` fecha, e
 * `paineis.test.tsx` falha se o nome de um recurso aparecer naquela linha.
 *
 * Ver `IconeDeRecurso` para o porquê de caminho embutido em vez de sprite.
 */

import type { DevCard } from '@ilhavera/rules';

export type Simbolo =
  /** Carta de recurso alheia — dorso, sem naipe. */
  | 'carta'
  /** Carta de Progresso alheia, sem dizer qual. */
  | 'progresso'
  /** Quem a mesa espera. */
  | 'vez'
  /** O relógio de turno, quando a sala o liga. */
  | 'relogio'
  /** Estados do botão de som. */
  | 'som'
  | 'mudo'
  /** O fim da partida. */
  | 'trofeu'
  /** Um dos cinco tipos de Carta de Progresso. */
  | DevCard;

const DESENHO: Readonly<Record<Simbolo, string>> = {
  carta:
    'M5.5 3h13a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3Zm2 3v3h3V6Z',
  /** O mesmo dorso, marcado — a contagem de Progresso anda ao lado da de recurso. */
  progresso:
    'M5.5 3h13a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3Zm6.5 3.6 1.4 3.1 3.1.3-2.4 2 .8 3.1-2.9-1.8-2.9 1.8.8-3.1-2.4-2 3.1-.3Z',
  vez: 'M8 4.5 18 12 8 19.5Z',
  relogio: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm.9 4.5v5.1l4 2.4-.9 1.5-5-3V6.5Z',
  /** Alto-falante com duas ondas. */
  som: 'M4 9.5h3.5L12 5v14L7.5 14.5H4Zm11 .1a4 4 0 0 1 0 4.8l1.5 1.2a6 6 0 0 0 0-7.2Zm2.6-3.1a8 8 0 0 1 0 11l1.5 1.2a10 10 0 0 0 0-13.4Z',
  /** O mesmo alto-falante, com o corte no lugar das ondas. */
  mudo: 'M4 9.5h3.5L12 5v14L7.5 14.5H4Zm11.3.1 1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1Z',
  trofeu:
    'M6 3h12v2h3v3a4 4 0 0 1-3.3 3.9A6 6 0 0 1 13 15.8V19h4v2H7v-2h4v-3.2a6 6 0 0 1-4.7-3.9A4 4 0 0 1 3 8V5h3Zm0 4H5v1a2 2 0 0 0 1 1.7Zm12 0v2.7A2 2 0 0 0 19 8V7Z',
  /** Escudo: o Soldado é defesa antes de ser ataque. */
  knight: 'M12 2 20 5v6.5c0 5-3.3 9.2-8 11.5-4.7-2.3-8-6.5-8-11.5V5Z',
  /** Estrela — o ponto que ninguém vê até o fim. */
  victoryPoint: 'M12 2.5 14.9 9h6.6l-5.3 4.4 2 6.9-6.2-4-6.2 4 2-6.9L2.5 9h6.6Z',
  /** Duas estradas paralelas, que é literalmente o que a carta dá. */
  roadBuilding: 'M3 6h18v3.5H3zM3 14.5h18V18H3z',
  /** Dois recursos entrando: as setas apontam para dentro. */
  yearOfPlenty: 'M6.5 2.5 10 8H7.5v6h-2V8H3ZM17.5 2.5 21 8h-2.5v6h-2V8H14ZM3 17h18v4H3z',
  /** Tudo converge para um: três setas para o centro. */
  monopoly: 'M12 22 5 15h4.2V9h5.6v6H19ZM4 2h16v4.5H4z',
};

export type IconeDeSimboloProps = {
  simbolo: Simbolo;
  /** Lado do quadrado, em pixels. */
  tamanho?: number;
};

export function IconeDeSimbolo({ simbolo, tamanho = 12 }: IconeDeSimboloProps): React.JSX.Element {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      data-simbolo={simbolo}
      className="shrink-0"
    >
      <path d={DESENHO[simbolo]} />
    </svg>
  );
}
