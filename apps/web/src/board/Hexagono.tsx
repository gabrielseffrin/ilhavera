/**
 * Um hexágono: terreno, ficha numérica e os pontinhos de probabilidade.
 */

import { HEX_SIZE, ROBBER_LABEL, TERRAIN_LABELS, type HexNode } from '@ilhavera/rules';

import { cantosDoHexagono, pontosDoPoligono } from './geometria.js';
import { COR_DO_TERRENO, corDaFicha, pontosDeProbabilidade } from './cores.js';

export type HexagonoProps = {
  hex: HexNode;
  /** O Saqueador escurece o hexágono: ele deixou de produzir. */
  bloqueado: boolean;
};

export function Hexagono({ hex, bloqueado }: HexagonoProps): React.JSX.Element {
  const cantos = cantosDoHexagono(hex.pixel);

  /**
   * O rótulo diz as três coisas que o desenho diz: o terreno, a ficha e se o
   * Saqueador está ali. A terceira faltava, e é a que muda a jogada — um
   * hexágono bloqueado não produz, e quem só ouve a tela precisa saber disso
   * tanto quanto quem vê a sombra.
   */
  const rotulo = [
    TERRAIN_LABELS[hex.terrain],
    hex.number === null ? null : `ficha ${hex.number}`,
    bloqueado ? `com o ${ROBBER_LABEL}` : null,
  ]
    .filter((p) => p !== null)
    .join(', ');

  return (
    <g data-hex={hex.id} data-terreno={hex.terrain} role="img" aria-label={rotulo}>
      <title>{rotulo}</title>
      <polygon
        points={pontosDoPoligono(cantos)}
        fill={COR_DO_TERRENO[hex.terrain]}
        stroke="oklch(0.30 0.02 250)"
        strokeWidth={2}
      />

      {/**
       * Sombra por cima, e não opacidade no terreno: baixar a opacidade deixaria
       * o mar atravessar o hexágono, e o bloqueado passaria a parecer água em
       * vez de terra parada.
       */}
      {bloqueado && (
        <polygon
          data-sombra="saqueador"
          points={pontosDoPoligono(cantos)}
          fill="oklch(0.2 0.02 265 / 0.42)"
          pointerEvents="none"
        />
      )}

      {hex.number !== null && <Ficha x={hex.pixel.x} y={hex.pixel.y} numero={hex.number} />}
    </g>
  );
}

function Ficha({ x, y, numero }: { x: number; y: number; numero: number }): React.JSX.Element {
  const cor = corDaFicha(numero);
  const pontos = pontosDeProbabilidade(numero);
  const raio = HEX_SIZE * 0.3;

  return (
    <g>
      <circle cx={x} cy={y} r={raio} fill="oklch(0.95 0.02 85)" stroke={cor} strokeWidth={1.5} />
      <text
        x={x}
        y={y - raio * 0.08}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={HEX_SIZE * 0.34}
        fontWeight={700}
        fill={cor}
      >
        {numero}
      </text>

      {/* Os pontinhos deixam a probabilidade legível sem fazer conta. */}
      {Array.from({ length: pontos }, (_, i) => (
        <circle
          key={i}
          cx={x + (i - (pontos - 1) / 2) * (HEX_SIZE * 0.075)}
          cy={y + raio * 0.62}
          r={HEX_SIZE * 0.022}
          fill={cor}
        />
      ))}
    </g>
  );
}
