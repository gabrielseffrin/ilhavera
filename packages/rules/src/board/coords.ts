/**
 * Coordenadas axiais (q, r) com hexágonos *pointy-top* — §4.3 do roadmap.
 */

import type { HexId, VertexId, EdgeId } from '../types.js';

export type HexCoord = { q: number; r: number };

/**
 * Vizinhos em ordem. A ordem importa: o canto `i` é definido como a interseção
 * entre o hexágono e os vizinhos `i` e `i+1`, então mudar esta lista renumera
 * todos os cantos.
 *
 * Com a projeção em pixel de `pixel.ts`, as direções são:
 * 0=L, 1=NE, 2=NO, 3=O, 4=SO, 5=SE.
 */
export const DIRS: readonly (readonly [number, number])[] = [
  [+1, 0],
  [+1, -1],
  [0, -1],
  [-1, 0],
  [-1, +1],
  [0, +1],
];

export function hexId(q: number, r: number): HexId {
  return `${q},${r}`;
}

export function toHexId(h: HexCoord): HexId {
  return hexId(h.q, h.r);
}

export function parseHexId(id: HexId): HexCoord {
  const [q, r] = id.split(',');
  return { q: Number(q), r: Number(r) };
}

export function neighborCoord(h: HexCoord, dir: number): HexCoord {
  const d = DIRS[((dir % 6) + 6) % 6] as readonly [number, number];
  return { q: h.q + d[0], r: h.r + d[1] };
}

export function neighborId(id: HexId, dir: number): HexId {
  return toHexId(neighborCoord(parseHexId(id), dir));
}

/**
 * Tabuleiro padrão: hexágono de raio 2 → 19 casas no formato 3-4-5-4-3.
 */
export const BOARD_RADIUS = 2;

export function standardHexes(): HexCoord[] {
  const out: HexCoord[] = [];
  for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r++) {
    const qMin = Math.max(-BOARD_RADIUS, -BOARD_RADIUS - r);
    const qMax = Math.min(BOARD_RADIUS, BOARD_RADIUS - r);
    for (let q = qMin; q <= qMax; q++) out.push({ q, r });
  }
  return out;
}

/**
 * ID canônico do vértice: a tripla ordenada lexicograficamente dos 3 hexágonos
 * que se encontram nele — §4.3. Alguns desses hexágonos podem estar fora do
 * tabuleiro ("água"); eles continuam entrando no ID, e é exatamente isso que
 * elimina a necessidade de normalização manual e imuniza contra bugs de
 * simetria: o mesmo ponto do plano sempre gera a mesma string, não importa por
 * qual dos hexágonos você chegou nele.
 */
export function makeVertexId(hexes: readonly HexCoord[]): VertexId {
  return hexes
    .map(toHexId)
    .sort()
    .join('|');
}

export function parseVertexId(id: VertexId): HexCoord[] {
  return id.split('|').map(parseHexId);
}

/** Os 3 hexágonos que formam o canto `corner` (0..5) do hexágono `h`. */
export function cornerHexes(h: HexCoord, corner: number): HexCoord[] {
  return [h, neighborCoord(h, corner), neighborCoord(h, corner + 1)];
}

/** O vértice no canto `corner` (0..5) do hexágono `h`. */
export function cornerVertexId(h: HexCoord, corner: number): VertexId {
  return makeVertexId(cornerHexes(h, corner));
}

/** ID canônico da aresta: par ordenado de vértices adjacentes — §4.3. */
export function makeEdgeId(a: VertexId, b: VertexId): EdgeId {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function parseEdgeId(id: EdgeId): [VertexId, VertexId] {
  const [a, b] = id.split('::');
  return [a as VertexId, b as VertexId];
}
