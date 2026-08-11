/**
 * Construção do grafo estático do tabuleiro — §4.3 do roadmap.
 *
 * A topologia (quais vértices existem, quem é vizinho de quem, quais arestas
 * ligam o quê) não depende de seed nenhuma: é sempre a mesma. Só o que é
 * sorteado — terreno, ficha numérica, tipo de porto — varia por partida.
 * Por isso a topologia é calculada uma vez e memoizada, e cada partida apenas
 * a decora.
 *
 * Com o grafo pronto, as regras viram operações triviais de grafo: regra de
 * distância é olhar `adjacentVertices`; conectividade de estrada é olhar
 * `edges` do vértice; Estrada Mais Longa é uma DFS.
 */

import type { EdgeId, HexId, PortType, Terrain, VertexId } from '../types.js';
import {
  cornerVertexId,
  makeEdgeId,
  parseHexId,
  standardHexes,
  toHexId,
  type HexCoord,
} from './coords.js';

export type Pixel = { x: number; y: number };

export type HexNode = {
  id: HexId;
  q: number;
  r: number;
  terrain: Terrain;
  /** `null` no deserto. */
  number: number | null;
  /** Os 6 cantos, em ordem de canto (0..5). */
  vertices: VertexId[];
  pixel: Pixel;
};

export type VertexNode = {
  id: VertexId;
  /** Apenas os hexágonos que estão no tabuleiro (1 a 3). */
  hexes: HexId[];
  adjacentVertices: VertexId[];
  edges: EdgeId[];
  port: PortType | null;
  pixel: Pixel;
};

export type EdgeNode = {
  id: EdgeId;
  vertices: [VertexId, VertexId];
  /** Hexágonos no tabuleiro que tocam esta aresta (1 = aresta de costa). */
  hexes: HexId[];
  pixel: Pixel;
};

export type BoardGraph = {
  hexes: Record<HexId, HexNode>;
  vertices: Record<VertexId, VertexNode>;
  edges: Record<EdgeId, EdgeNode>;
  /** Ordens estáveis, para iteração determinística e hashing de estado. */
  hexOrder: HexId[];
  vertexOrder: VertexId[];
  edgeOrder: EdgeId[];
};

/** Raio do hexágono em unidades de SVG. O cliente só precisa escalar o viewBox. */
export const HEX_SIZE = 60;

const SQRT3 = Math.sqrt(3);

/** Centro do hexágono em pixel, para malha pointy-top. */
export function hexPixel(h: HexCoord): Pixel {
  return {
    x: HEX_SIZE * SQRT3 * (h.q + h.r / 2),
    y: HEX_SIZE * 1.5 * h.r,
  };
}

/**
 * Numa malha hexagonal regular, o vértice compartilhado por 3 hexágonos é
 * exatamente o baricentro dos 3 centros. Isso dispensa qualquer trigonometria
 * de canto — e, como a tripla do ID já inclui os hexágonos de água, funciona
 * igual na borda.
 */
function vertexPixel(id: VertexId): Pixel {
  const hexes = id.split('|').map(parseHexId);
  let x = 0;
  let y = 0;
  for (const h of hexes) {
    const p = hexPixel(h);
    x += p.x;
    y += p.y;
  }
  return { x: x / hexes.length, y: y / hexes.length };
}

type Topology = {
  hexOrder: HexId[];
  vertexOrder: VertexId[];
  edgeOrder: EdgeId[];
  hexCoords: Record<HexId, HexCoord>;
  hexVertices: Record<HexId, VertexId[]>;
  vertexHexes: Record<VertexId, HexId[]>;
  vertexAdjacent: Record<VertexId, VertexId[]>;
  vertexEdges: Record<VertexId, EdgeId[]>;
  edgeVertices: Record<EdgeId, [VertexId, VertexId]>;
  edgeHexes: Record<EdgeId, HexId[]>;
  /** Arestas de costa em ordem cíclica ao redor do tabuleiro. */
  coastLoop: EdgeId[];
};

let cachedTopology: Topology | null = null;

function buildTopology(): Topology {
  const coords = standardHexes();
  const hexOrder: HexId[] = [];
  const hexCoords: Record<HexId, HexCoord> = {};
  const hexVertices: Record<HexId, VertexId[]> = {};

  for (const c of coords) {
    const id = toHexId(c);
    hexOrder.push(id);
    hexCoords[id] = c;
    // Canto i = interseção com os vizinhos i e i+1.
    hexVertices[id] = [0, 1, 2, 3, 4, 5].map((corner) => cornerVertexId(c, corner));
  }

  // Vértices: dedup dos 6 cantos de cada hexágono (19 × 6 = 114 → 54).
  const vertexHexes: Record<VertexId, HexId[]> = {};
  for (const hid of hexOrder) {
    for (const vid of hexVertices[hid] as VertexId[]) {
      (vertexHexes[vid] ??= []).push(hid);
    }
  }
  const vertexOrder = Object.keys(vertexHexes).sort();

  // Arestas: cada lado do hexágono liga os cantos i e i+1 (114 → 72).
  const edgeVertices: Record<EdgeId, [VertexId, VertexId]> = {};
  const edgeHexes: Record<EdgeId, HexId[]> = {};
  for (const hid of hexOrder) {
    const corners = hexVertices[hid] as VertexId[];
    for (let i = 0; i < 6; i++) {
      const a = corners[i] as VertexId;
      const b = corners[(i + 1) % 6] as VertexId;
      const eid = makeEdgeId(a, b);
      edgeVertices[eid] = a < b ? [a, b] : [b, a];
      (edgeHexes[eid] ??= []).push(hid);
    }
  }
  const edgeOrder = Object.keys(edgeVertices).sort();

  const vertexEdges: Record<VertexId, EdgeId[]> = {};
  const vertexAdjacent: Record<VertexId, VertexId[]> = {};
  for (const vid of vertexOrder) {
    vertexEdges[vid] = [];
    vertexAdjacent[vid] = [];
  }
  for (const eid of edgeOrder) {
    const [a, b] = edgeVertices[eid] as [VertexId, VertexId];
    (vertexEdges[a] as EdgeId[]).push(eid);
    (vertexEdges[b] as EdgeId[]).push(eid);
    (vertexAdjacent[a] as VertexId[]).push(b);
    (vertexAdjacent[b] as VertexId[]).push(a);
  }

  return {
    hexOrder,
    vertexOrder,
    edgeOrder,
    hexCoords,
    hexVertices,
    vertexHexes,
    vertexAdjacent,
    vertexEdges,
    edgeVertices,
    edgeHexes,
    coastLoop: buildCoastLoop(edgeOrder, edgeHexes, edgeVertices),
  };
}

/**
 * Arestas de costa (as que tocam um único hexágono do tabuleiro) ordenadas
 * ciclicamente pelo ângulo do ponto médio em relação ao centro do tabuleiro.
 * O tabuleiro padrão é um hexágono de raio 2 centrado na origem, então o
 * ângulo dá uma volta limpa. São 30 arestas de costa.
 */
function buildCoastLoop(
  edgeOrder: EdgeId[],
  edgeHexes: Record<EdgeId, HexId[]>,
  edgeVertices: Record<EdgeId, [VertexId, VertexId]>,
): EdgeId[] {
  const coast = edgeOrder.filter((eid) => (edgeHexes[eid] as HexId[]).length === 1);
  return coast
    .map((eid) => {
      const [a, b] = edgeVertices[eid] as [VertexId, VertexId];
      const pa = vertexPixel(a);
      const pb = vertexPixel(b);
      const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      return { eid, angle: Math.atan2(mid.y, mid.x) };
    })
    .sort((x, y) => x.angle - y.angle || x.eid.localeCompare(y.eid))
    .map((x) => x.eid);
}

export function topology(): Topology {
  cachedTopology ??= buildTopology();
  return cachedTopology;
}

/**
 * Monta o `BoardGraph` completo a partir da topologia + o que foi sorteado.
 */
export function assembleBoard(
  terrainByHex: Record<HexId, Terrain>,
  numberByHex: Record<HexId, number | null>,
  portByVertex: Record<VertexId, PortType>,
): BoardGraph {
  const t = topology();

  const hexes: Record<HexId, HexNode> = {};
  for (const id of t.hexOrder) {
    const c = t.hexCoords[id] as HexCoord;
    hexes[id] = {
      id,
      q: c.q,
      r: c.r,
      terrain: terrainByHex[id] as Terrain,
      number: numberByHex[id] ?? null,
      vertices: [...(t.hexVertices[id] as VertexId[])],
      pixel: hexPixel(c),
    };
  }

  const vertices: Record<VertexId, VertexNode> = {};
  for (const id of t.vertexOrder) {
    vertices[id] = {
      id,
      hexes: [...(t.vertexHexes[id] as HexId[])],
      adjacentVertices: [...(t.vertexAdjacent[id] as VertexId[])],
      edges: [...(t.vertexEdges[id] as EdgeId[])],
      port: portByVertex[id] ?? null,
      pixel: vertexPixel(id),
    };
  }

  const edges: Record<EdgeId, EdgeNode> = {};
  for (const id of t.edgeOrder) {
    const [a, b] = t.edgeVertices[id] as [VertexId, VertexId];
    const pa = vertices[a] as VertexNode;
    const pb = vertices[b] as VertexNode;
    edges[id] = {
      id,
      vertices: [a, b],
      hexes: [...(t.edgeHexes[id] as HexId[])],
      pixel: { x: (pa.pixel.x + pb.pixel.x) / 2, y: (pa.pixel.y + pb.pixel.y) / 2 },
    };
  }

  return {
    hexes,
    vertices,
    edges,
    hexOrder: [...t.hexOrder],
    vertexOrder: [...t.vertexOrder],
    edgeOrder: [...t.edgeOrder],
  };
}
