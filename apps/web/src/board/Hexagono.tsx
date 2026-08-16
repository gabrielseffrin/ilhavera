/**
 * Um hexágono: terreno, ficha numérica e os pontinhos de probabilidade.
 */

import { HEX_SIZE, ROBBER_LABEL, TERRAIN_LABELS, type HexNode } from '@ilhavera/rules';

import { cantosDoHexagono, pontosDoPoligono } from './geometria.js';
import { COR_DO_TERRENO, corDaFicha, fichaQuente, pontosDeProbabilidade } from './cores.js';
import { CAMINHO_DO_TERRENO, TINTA_DO_TERRENO } from './terrenos.js';

/** Os ícones nascem num quadrado de 24; aqui eles viram quase um hexágono. */
const LADO_DO_ICONE = 24;
const MARCA = (HEX_SIZE * 0.95) / LADO_DO_ICONE;

function marcaDagua(x: number, y: number): string {
  const canto = (LADO_DO_ICONE / 2) * MARCA;
  return `translate(${(x - canto).toFixed(2)} ${(y - canto).toFixed(2)}) scale(${MARCA.toFixed(3)})`;
}

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
       * A marca d'água do terreno, centrada e por baixo de tudo o mais.
       *
       * Centrada, e não acima da ficha, porque o hexágono é largo no meio e
       * estreito nas pontas: encaixá-la num canto exigiria encolhê-la até o
       * ponto em que ela deixaria de ser reconhecível. Por baixo da ficha, que
       * tem preenchimento opaco, o número não perde um décimo de contraste.
       *
       * `pointerEvents="none"` porque a camada interativa vive acima e é ela
       * quem recebe clique — uma marca decorativa que rouba evento seria um bug
       * invisível no código e óbvio no dedo.
       */}
      <path
        data-marca-do-terreno={hex.terrain}
        d={CAMINHO_DO_TERRENO[hex.terrain]}
        fill={TINTA_DO_TERRENO[hex.terrain]}
        transform={marcaDagua(hex.pixel.x, hex.pixel.y)}
        pointerEvents="none"
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
  const quente = fichaQuente(numero);
  const raio = HEX_SIZE * 0.3;

  return (
    <g>
      {/**
       * A borda mais grossa no 6 e no 8 é o segundo sinal, além do vermelho.
       * Cor sozinha deixaria de fora justamente quem mais precisa do destaque —
       * e "onde estão os números quentes" é a pergunta que decide o assentamento
       * inicial, que é a jogada mais cara de errar na partida inteira.
       */}
      <circle
        cx={x}
        cy={y}
        r={raio}
        fill="oklch(0.96 0.02 85)"
        stroke={cor}
        strokeWidth={quente ? 3 : 1.5}
      />
      <text
        x={x}
        y={y - raio * 0.18}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={HEX_SIZE * 0.34}
        fontWeight={700}
        fill={cor}
      >
        {numero}
      </text>

      {/**
       * Os pontinhos deixam a probabilidade legível sem fazer conta — e por
       * isso precisam ser vistos. Nasceram com raio `HEX_SIZE * 0.022`, que dá
       * **1,32px** num hexágono de raio 60: existiam no DOM e não na tela. O
       * raio quase triplicou e o espaçamento acompanhou; cinco pontos ocupam
       * ~28px dentro de uma ficha de 36 de diâmetro, com folga nas bordas.
       */}
      {Array.from({ length: pontos }, (_, i) => (
        <circle
          key={i}
          cx={x + (i - (pontos - 1) / 2) * (HEX_SIZE * 0.098)}
          cy={y + raio * 0.66}
          r={HEX_SIZE * 0.036}
          fill={cor}
        />
      ))}
    </g>
  );
}
