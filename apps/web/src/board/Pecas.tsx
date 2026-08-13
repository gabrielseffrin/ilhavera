/**
 * As peças na mesa: estradas, assentamentos e cidades, na cor de cada jogador.
 *
 * Desenhadas por cima do terreno e por baixo da camada interativa — clique é
 * assunto de quem sabe o que é legal, não das peças.
 */

import {
  HEX_SIZE,
  type BoardGraph,
  type Building,
  type PlayerId,
  type Road,
} from '@ilhavera/rules';

import { CONTORNO_DO_JOGADOR, COR_DO_JOGADOR } from './cores.js';
import type { PlayerColor } from '@ilhavera/rules';

export type PecasProps = {
  board: BoardGraph;
  buildings: Record<string, Building>;
  roads: Record<string, Road>;
  /** Cor de cada jogador, para não recalcular por peça. */
  cores: Record<PlayerId, PlayerColor>;
};

export function Pecas({ board, buildings, roads, cores }: PecasProps): React.JSX.Element {
  return (
    <g data-camada="pecas" pointerEvents="none">
      {Object.entries(roads).map(([edgeId, estrada]) => {
        const aresta = board.edges[edgeId];
        const cor = cores[estrada.owner];
        if (aresta === undefined || cor === undefined) return null;

        const [a, b] = aresta.vertices;
        const pa = board.vertices[a]?.pixel;
        const pb = board.vertices[b]?.pixel;
        if (pa === undefined || pb === undefined) return null;

        return (
          <g key={edgeId} data-estrada={edgeId} data-dono={estrada.owner}>
            {/* Traço escuro mais grosso por baixo: sem ele, estrada vermelha
                sobre colina vermelha desaparece. */}
            <line
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke={CONTORNO_DO_JOGADOR[cor]}
              strokeWidth={HEX_SIZE * 0.19}
              strokeLinecap="round"
            />
            <line
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke={COR_DO_JOGADOR[cor]}
              strokeWidth={HEX_SIZE * 0.12}
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {Object.entries(buildings).map(([vertexId, construcao]) => {
        const ponto = board.vertices[vertexId]?.pixel;
        const cor = cores[construcao.owner];
        if (ponto === undefined || cor === undefined) return null;

        return construcao.type === 'city' ? (
          <Cidade
            key={vertexId}
            id={vertexId}
            x={ponto.x}
            y={ponto.y}
            cor={cor}
            dono={construcao.owner}
          />
        ) : (
          <Assentamento
            key={vertexId}
            id={vertexId}
            x={ponto.x}
            y={ponto.y}
            cor={cor}
            dono={construcao.owner}
          />
        );
      })}
    </g>
  );
}

type PecaProps = { id: string; x: number; y: number; cor: PlayerColor; dono: PlayerId };

/** Casa simples: base quadrada com telhado de duas águas. */
function Assentamento({ id, x, y, cor, dono }: PecaProps): React.JSX.Element {
  const l = HEX_SIZE * 0.17;

  return (
    <polygon
      data-assentamento={id}
      data-dono={dono}
      points={`${x - l},${y + l} ${x - l},${y - l * 0.2} ${x},${y - l} ${x + l},${y - l * 0.2} ${x + l},${y + l}`}
      fill={COR_DO_JOGADOR[cor]}
      stroke={CONTORNO_DO_JOGADOR[cor]}
      strokeWidth={2}
    />
  );
}

/** Cidade: mais larga e com uma torre, para se distinguir à distância. */
function Cidade({ id, x, y, cor, dono }: PecaProps): React.JSX.Element {
  const l = HEX_SIZE * 0.22;

  return (
    <polygon
      data-cidade={id}
      data-dono={dono}
      points={`${x - l},${y + l * 0.8} ${x - l},${y - l * 0.3} ${x - l * 0.3},${y - l * 0.9}
               ${x + l * 0.35},${y - l * 0.3} ${x + l},${y - l * 0.3} ${x + l},${y + l * 0.8}`}
      fill={COR_DO_JOGADOR[cor]}
      stroke={CONTORNO_DO_JOGADOR[cor]}
      strokeWidth={2}
    />
  );
}
