/**
 * O tabuleiro em SVG.
 *
 * SVG e não canvas por decisão de §6.1: 19 hexágonos, 54 vértices e 72 arestas
 * são poucos nós no DOM, e em troca vêm hit-testing, acessibilidade e animação
 * por CSS de graça. Canvas seria complexidade sem retorno nesta escala.
 *
 * O componente é **puro**: recebe um estado e desenha. Não conhece socket, não
 * conhece store, não decide jogada — o que permite testá-lo com um estado
 * montado à mão e reaproveitá-lo tal e qual quando a Fase 4 trocar a origem do
 * estado.
 */

import { HEX_SIZE, type ClientView, type GameState } from '@ilhavera/rules';

import { caixaDoTabuleiro, viewBox } from './geometria.js';
import { COR_DO_MAR } from './cores.js';
import { Hexagono } from './Hexagono.js';
import { Portos } from './Portos.js';
import { Saqueador } from './Saqueador.js';
import { t } from '../i18n/pt-BR.js';

/**
 * Serve tanto o estado completo (hot-seat) quanto a projeção que vem do
 * servidor: o tabuleiro só usa o que é público nos dois.
 */
export type EstadoDoTabuleiro = Pick<GameState | ClientView, 'board' | 'robberHex'>;

export type TabuleiroProps = {
  estado: EstadoDoTabuleiro;
  /** Camadas de interação e peças entram por cima, desenhadas por quem chama. */
  children?: React.ReactNode;
};

export function Tabuleiro({ estado, children }: TabuleiroProps): React.JSX.Element {
  const { board, robberHex } = estado;
  const caixa = caixaDoTabuleiro(board);

  return (
    <svg
      viewBox={viewBox(caixa)}
      className="h-full w-full"
      role="img"
      aria-label={t.tabuleiro.rotulo}
      data-testid="tabuleiro"
    >
      <rect
        x={caixa.minX}
        y={caixa.minY}
        width={caixa.largura}
        height={caixa.altura}
        fill={COR_DO_MAR}
      />

      <Portos board={board} caixa={caixa} />

      <g data-camada="hexagonos">
        {board.hexOrder.map((id) => {
          const hex = board.hexes[id];
          if (hex === undefined) return null;
          return <Hexagono key={id} hex={hex} bloqueado={id === robberHex} />;
        })}
      </g>

      {/* Depois dos hexágonos e antes das peças: o Saqueador fica por cima do
          terreno, mas nunca esconde uma cidade. */}
      <Saqueador pixel={board.hexes[robberHex]?.pixel} tamanho={HEX_SIZE} />

      {children}
    </svg>
  );
}
