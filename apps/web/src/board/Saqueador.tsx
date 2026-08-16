/**
 * O Saqueador — "Ladrão" no jogo original, renomeado por §2 do roadmap.
 *
 * Desenhado como um vulto escuro no canto inferior do hexágono, e não no
 * centro: o centro é da ficha numérica, que precisa continuar legível para quem
 * decide onde assentar.
 *
 * O vulto é desenhado na **origem** e posicionado por `transform`, e não com as
 * coordenadas embutidas em cada forma. A diferença aparece quando ele se move:
 * uma transformação o CSS sabe animar, e o Saqueador desliza de um hexágono para
 * o outro. Redesenhá-lo em coordenadas novas o faria teleportar — e ele
 * realmente se moveu, então vale mostrar para onde.
 */

import { ROBBER_LABEL, type Pixel } from '@ilhavera/rules';

export type SaqueadorProps = {
  /** `undefined` só se o estado apontar para um hexágono que não existe. */
  pixel: Pixel | undefined;
  tamanho: number;
};

export function Saqueador({ pixel, tamanho }: SaqueadorProps): React.JSX.Element | null {
  if (pixel === undefined) return null;

  const x = pixel.x;
  const y = pixel.y + tamanho * 0.42;
  const altura = tamanho * 0.3;
  const largura = tamanho * 0.2;

  return (
    <g
      data-camada="saqueador"
      data-saqueador
      pointerEvents="none"
      transform={`translate(${x} ${y})`}
    >
      <title>{ROBBER_LABEL}</title>
      <ellipse
        cx={0}
        cy={altura * 0.42}
        rx={largura * 0.9}
        ry={altura * 0.16}
        fill="oklch(0.2 0.01 260 / 0.35)"
      />
      <path
        d={`M 0 ${-altura * 0.6}
            c ${largura * 0.62} 0 ${largura * 0.78} ${altura * 0.5} ${largura * 0.78} ${altura}
            l ${-largura * 1.56} 0
            c 0 ${-altura * 0.5} ${largura * 0.16} ${-altura} ${largura * 0.78} ${-altura} z`}
        fill="oklch(0.24 0.02 265)"
        stroke="oklch(0.90 0.01 260)"
        strokeWidth={1.2}
      />
    </g>
  );
}
