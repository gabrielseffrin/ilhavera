/**
 * Onde se pode clicar — e só onde se pode clicar.
 *
 * O destaque **não** é uma reimplementação das regras: sai de
 * `enumerateLegalActions`, o mesmo enumerador que o servidor usa para validar e
 * que a CLI usa para montar o menu. Por isso é impossível a interface oferecer
 * uma jogada que o servidor recusaria — não porque alguém tomou cuidado, mas
 * porque a lista vem da mesma função.
 *
 * Alvos invisíveis maiores que o desenho: um vértice de 4px de raio é
 * impossível de acertar no toque. O `<circle>` clicável tem folga; o que se vê
 * é menor.
 */

import { HEX_SIZE, type Action, type BoardGraph } from '@ilhavera/rules';

export type CamadaInterativaProps = {
  board: BoardGraph;
  /** As jogadas legais de quem está agindo agora. */
  legais: readonly Action[];
  onEscolher: (acao: Action) => void;
};

const RAIO_ALVO = HEX_SIZE * 0.22;
const RAIO_VISIVEL = HEX_SIZE * 0.11;

export function CamadaInterativa({
  board,
  legais,
  onEscolher,
}: CamadaInterativaProps): React.JSX.Element {
  /**
   * Uma jogada por vértice e por aresta. Quando duas caem no mesmo lugar — pôr
   * assentamento e evoluir para cidade nunca coexistem, mas o enumerador não
   * promete isso — a primeira vence, e o destaque continua honesto porque
   * ambas seriam aceitas.
   */
  const porVertice = new Map<string, Action>();
  const porAresta = new Map<string, Action>();

  for (const acao of legais) {
    if (acao.type === 'placeSettlement' || acao.type === 'buildCity') {
      if (!porVertice.has(acao.vertexId)) porVertice.set(acao.vertexId, acao);
    } else if (acao.type === 'placeRoad') {
      if (!porAresta.has(acao.edgeId)) porAresta.set(acao.edgeId, acao);
    }
  }

  return (
    <g data-camada="interativa">
      {[...porAresta].map(([edgeId, acao]) => {
        const aresta = board.edges[edgeId];
        if (aresta === undefined) return null;

        const [a, b] = aresta.vertices;
        const pa = board.vertices[a]?.pixel;
        const pb = board.vertices[b]?.pixel;
        if (pa === undefined || pb === undefined) return null;

        return (
          <g key={edgeId} data-aresta-legal={edgeId}>
            <line
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke="oklch(0.95 0.16 100 / 0.85)"
              strokeWidth={HEX_SIZE * 0.09}
              strokeLinecap="round"
              pointerEvents="none"
            />
            <line
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke="transparent"
              strokeWidth={HEX_SIZE * 0.28}
              strokeLinecap="round"
              className="cursor-pointer"
              onClick={() => {
                onEscolher(acao);
              }}
            >
              <title>Construir estrada aqui</title>
            </line>
          </g>
        );
      })}

      {[...porVertice].map(([vertexId, acao]) => {
        const ponto = board.vertices[vertexId]?.pixel;
        if (ponto === undefined) return null;

        return (
          <g key={vertexId} data-vertice-legal={vertexId} data-acao={acao.type}>
            <circle
              cx={ponto.x}
              cy={ponto.y}
              r={RAIO_VISIVEL}
              fill="oklch(0.95 0.16 100 / 0.9)"
              stroke="oklch(0.35 0.06 100)"
              strokeWidth={1.5}
              pointerEvents="none"
            >
              <animate
                attributeName="r"
                values={`${RAIO_VISIVEL};${RAIO_VISIVEL * 1.35};${RAIO_VISIVEL}`}
                dur="1.6s"
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx={ponto.x}
              cy={ponto.y}
              r={RAIO_ALVO}
              fill="transparent"
              className="cursor-pointer"
              onClick={() => {
                onEscolher(acao);
              }}
            >
              <title>
                {acao.type === 'buildCity' ? 'Evoluir para cidade' : 'Construir assentamento'}
              </title>
            </circle>
          </g>
        );
      })}
    </g>
  );
}
