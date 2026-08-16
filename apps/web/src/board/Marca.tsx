/**
 * A forma que identifica um jogador, além da cor.
 *
 * Um componente só, usado em dois contextos que parecem diferentes e não são:
 * dentro das peças do tabuleiro (dentro de um `<svg>` que já existe) e nas
 * listas da HUD (num `<svg>` próprio, do tamanho de uma letra). O desenho é o
 * mesmo — o que muda é quem abre o `<svg>`.
 *
 * Ver `MARCA_DO_JOGADOR` em `cores.ts` para o porquê de isto existir.
 */

import { CONTORNO_DO_JOGADOR, COR_DO_JOGADOR, MARCA_DO_JOGADOR, NOME_DA_MARCA } from './cores.js';
import type { MarcaDeJogador } from './cores.js';
import type { PlayerColor } from '@ilhavera/rules';

export type MarcaProps = {
  marca: MarcaDeJogador;
  /** Centro, nas coordenadas de quem desenha. */
  x: number;
  y: number;
  /** Meia-largura da marca. */
  r: number;
  cor: string;
};

/**
 * Só o traçado, sem `<svg>` em volta. Serve tanto para o tabuleiro quanto para
 * o ícone da HUD.
 */
export function Marca({ marca, x, y, r, cor }: MarcaProps): React.JSX.Element {
  const traco = Math.max(1, r * 0.55);
  const comum = {
    stroke: cor,
    strokeWidth: traco,
    strokeLinecap: 'round' as const,
    fill: 'none',
  };

  switch (marca) {
    case 'ponto':
      return <circle cx={x} cy={y} r={r * 0.55} fill={cor} />;
    case 'barra':
      return <line x1={x - r} y1={y} x2={x + r} y2={y} {...comum} />;
    case 'traco':
      return <line x1={x} y1={y - r} x2={x} y2={y + r} {...comum} />;
    case 'cruz':
      return (
        <g>
          <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} {...comum} />
          <line x1={x - r} y1={y + r} x2={x + r} y2={y - r} {...comum} />
        </g>
      );
    case 'triangulo':
      return (
        <polygon
          points={`${x},${y - r} ${x + r},${y + r * 0.8} ${x - r},${y + r * 0.8}`}
          fill={cor}
        />
      );
    case 'losango':
      return (
        <polygon points={`${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`} fill={cor} />
      );
  }
}

export type IconeDoJogadorProps = {
  cor: PlayerColor;
  /** Lado do ícone em pixels. */
  tamanho?: number;
  /**
   * O que o leitor de tela diz. Quando ausente, o ícone é decorativo — que é o
   * caso quando o nome do jogador já está escrito ao lado.
   */
  rotulo?: string;
};

/**
 * O mesmo símbolo, do tamanho de uma letra, para as listas da HUD.
 *
 * Sempre acompanhado do nome do jogador em texto nas listas onde aparece, então
 * o padrão é `aria-hidden`: anunciar "losango marrom" antes de cada nome seria
 * ruído, não informação. `rotulo` existe para onde o nome não está do lado.
 */
export function IconeDoJogador({
  cor,
  tamanho = 14,
  rotulo,
}: IconeDoJogadorProps): React.JSX.Element {
  const meio = tamanho / 2;

  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox={`0 0 ${tamanho} ${tamanho}`}
      className="inline-block shrink-0"
      data-marca={MARCA_DO_JOGADOR[cor]}
      {...(rotulo === undefined
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': `${rotulo} (${NOME_DA_MARCA[MARCA_DO_JOGADOR[cor]]})` })}
    >
      <circle
        cx={meio}
        cy={meio}
        r={meio - 1}
        fill={COR_DO_JOGADOR[cor]}
        stroke={CONTORNO_DO_JOGADOR[cor]}
        strokeWidth={1.5}
      />
      <Marca
        marca={MARCA_DO_JOGADOR[cor]}
        x={meio}
        y={meio}
        r={meio * 0.45}
        cor={CONTORNO_DO_JOGADOR[cor]}
      />
    </svg>
  );
}
