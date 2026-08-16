/**
 * Os portos, desenhados no mar e ligados aos dois vértices que os usam.
 *
 * Um porto ocupa **dois** vértices adjacentes na costa (§3.1). O motor grava a
 * marca em cada vértice separadamente; aqui os pares são reagrupados para
 * desenhar um selo só, com as duas amarras — que é como se lê no tabuleiro
 * físico e como o jogador espera ver.
 */

import {
  HEX_SIZE,
  portLabel,
  RESOURCE_LABELS,
  type BoardGraph,
  type PortType,
  type Pixel,
} from '@ilhavera/rules';

import { centroDoTabuleiro, direcaoParaFora, type Caixa } from './geometria.js';

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

            <circle
              cx={selo.x}
              cy={selo.y}
              r={HEX_SIZE * 0.3}
              fill="oklch(0.93 0.02 240)"
              stroke="oklch(0.35 0.03 250)"
              strokeWidth={2}
            />
            <text
              x={selo.x}
              y={par.tipo === 'generic' ? selo.y : selo.y - HEX_SIZE * 0.09}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={HEX_SIZE * 0.2}
              fontWeight={700}
              fill="oklch(0.30 0.03 250)"
            >
              {par.tipo === 'generic' ? '3:1' : '2:1'}
            </text>
            {/* Só o recurso embaixo: a taxa já está na linha de cima, e repetir
                "2:1" transbordava o selo. */}
            {par.tipo !== 'generic' && (
              <text
                x={selo.x}
                y={selo.y + HEX_SIZE * 0.12}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={HEX_SIZE * 0.14}
                fill="oklch(0.30 0.03 250)"
              >
                {RESOURCE_LABELS[par.tipo]}
              </text>
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
