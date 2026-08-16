/**
 * Os portos, desenhados no mar e ligados aos dois vértices que os usam.
 *
 * Um porto ocupa **dois** vértices adjacentes na costa (§3.1). O motor grava a
 * marca em cada vértice separadamente; aqui os pares são reagrupados para
 * desenhar um selo só, com as duas amarras — que é como se lê no tabuleiro
 * físico e como o jogador espera ver.
 */

import { HEX_SIZE, portLabel, type BoardGraph, type PortType, type Pixel } from '@ilhavera/rules';

import { CAMINHO_DO_RECURSO } from '../hud/icones/IconeDeRecurso.js';
import { COR_DO_RECURSO } from './cores.js';
import { centroDoTabuleiro, direcaoParaFora, type Caixa } from './geometria.js';

/** O ícone do recurso, encolhido para caber na metade de baixo do selo. */
const LADO_DO_ICONE = 24;
const SELO = (HEX_SIZE * 0.26) / LADO_DO_ICONE;

function selarIcone(x: number, y: number): string {
  const canto = (LADO_DO_ICONE / 2) * SELO;
  return `translate(${(x - canto).toFixed(2)} ${(y - canto).toFixed(2)}) scale(${SELO.toFixed(3)})`;
}

export type PortosProps = {
  board: BoardGraph;
  caixa: Caixa;
};

type Par = { tipo: PortType; vertices: [string, string]; meio: Pixel };

/**
 * Agrupa vértices de porto em pares adjacentes de mesmo tipo.
 *
 * Vértice de porto que não encontra parceiro é desenhado sozinho em vez de
 * sumir: se a geração mudar e quebrar o pareamento, o defeito fica visível na
 * tela em vez de silencioso.
 */
function paresDePorto(board: BoardGraph): { pares: Par[]; avulsos: string[] } {
  const comPorto = board.vertexOrder.filter((id) => board.vertices[id]?.port != null);
  const usados = new Set<string>();
  const pares: Par[] = [];

  for (const id of comPorto) {
    if (usados.has(id)) continue;
    const vertice = board.vertices[id];
    if (vertice === undefined || vertice.port == null) continue;

    const parceiro = vertice.adjacentVertices.find(
      (outro) => !usados.has(outro) && board.vertices[outro]?.port === vertice.port,
    );
    if (parceiro === undefined) continue;

    const pontoB = board.vertices[parceiro]?.pixel;
    if (pontoB === undefined) continue;

    usados.add(id);
    usados.add(parceiro);
    pares.push({
      tipo: vertice.port,
      vertices: [id, parceiro],
      meio: { x: (vertice.pixel.x + pontoB.x) / 2, y: (vertice.pixel.y + pontoB.y) / 2 },
    });
  }

  return { pares, avulsos: comPorto.filter((id) => !usados.has(id)) };
}

export function Portos({ board, caixa }: PortosProps): React.JSX.Element {
  const centro = centroDoTabuleiro(caixa);
  const { pares, avulsos } = paresDePorto(board);

  return (
    <g data-camada="portos">
      {pares.map((par) => {
        const fora = direcaoParaFora(par.meio, centro);
        const selo = {
          x: par.meio.x + fora.x * HEX_SIZE * 0.62,
          y: par.meio.y + fora.y * HEX_SIZE * 0.62,
        };

        return (
          <g key={par.vertices.join('|')} data-porto={par.tipo}>
            <title>{`Porto ${portLabel(par.tipo)}`}</title>

            {par.vertices.map((v) => {
              const ponto = board.vertices[v]?.pixel;
              if (ponto === undefined) return null;
              return (
                <line
                  key={v}
                  x1={ponto.x}
                  y1={ponto.y}
                  x2={selo.x}
                  y2={selo.y}
                  stroke="oklch(0.35 0.03 250)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              );
            })}

            {/**
             * O anel diz **qual** porto, e o disco continua claro.
             *
             * Os nove portos eram discos cinza idênticos, distinguidos por um
             * nome de recurso em 8,4px — ilegível no tamanho em que o tabuleiro
             * é realmente olhado. Pintar o disco inteiro na cor do recurso
             * resolveria a identificação e quebraria o contraste do "2:1", que
             * teria de ser claro sobre Trigo e escuro sobre Minério. O anel
             * carrega a cor, o disco carrega o texto, e nenhum atrapalha o
             * outro.
             */}
            <circle
              cx={selo.x}
              cy={selo.y}
              r={HEX_SIZE * 0.3}
              fill="oklch(0.95 0.015 240)"
              stroke={par.tipo === 'generic' ? 'oklch(0.45 0.02 250)' : COR_DO_RECURSO[par.tipo]}
              strokeWidth={par.tipo === 'generic' ? 2.5 : 4}
            />
            <text
              x={selo.x}
              y={par.tipo === 'generic' ? selo.y : selo.y - HEX_SIZE * 0.11}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={HEX_SIZE * 0.2}
              fontWeight={700}
              fill="oklch(0.28 0.03 250)"
            >
              {par.tipo === 'generic' ? '3:1' : '2:1'}
            </text>
            {/* O desenho no lugar do nome: a mesma marca que o hexágono que
                produz o recurso leva, e que a carta na mão leva. */}
            {par.tipo !== 'generic' && (
              <path
                d={CAMINHO_DO_RECURSO[par.tipo]}
                fill="oklch(0.28 0.03 250)"
                transform={selarIcone(selo.x, selo.y + HEX_SIZE * 0.11)}
                pointerEvents="none"
              />
            )}
          </g>
        );
      })}

      {avulsos.map((id) => {
        const ponto = board.vertices[id]?.pixel;
        if (ponto === undefined) return null;
        return (
          <circle
            key={id}
            data-porto-avulso={id}
            cx={ponto.x}
            cy={ponto.y}
            r={HEX_SIZE * 0.1}
            fill="oklch(0.93 0.02 240)"
            stroke="oklch(0.35 0.03 250)"
          />
        );
      })}
    </g>
  );
}
