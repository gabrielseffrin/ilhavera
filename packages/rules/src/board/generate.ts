/**
 * Sorteio do tabuleiro: terrenos, fichas numéricas e portos — §3.1 do roadmap.
 *
 * Tudo consome o PRNG semeado, então o mesmo `(seed, cursor)` sempre produz o
 * mesmo tabuleiro. É isso que faz o replay determinístico funcionar desde a
 * primeira ação da partida.
 */

import {
  NUMBER_TOKENS,
  PORT_DISTRIBUTION,
  RED_NUMBERS,
  TERRAIN_DISTRIBUTION,
  TERRAINS,
  type HexId,
  type PortType,
  type Terrain,
  type VertexId,
} from '../types.js';
import { shuffle } from '../rng.js';
import { DIRS, parseEdgeId, parseHexId, toHexId } from './coords.js';
import { assembleBoard, topology, type BoardGraph } from './graph.js';

export type BoardMode = 'balanced' | 'random';

/**
 * Posições dos 9 portos ao longo das 30 arestas de costa, em ordem cíclica.
 * Os intervalos alternam 2 e 3 arestas vazias (3,4,3,3,4,3,3,4,3 = 30), que é
 * o espaçamento do tabuleiro físico.
 */
const PORT_COAST_INDEXES: readonly number[] = [0, 3, 7, 10, 13, 17, 20, 23, 27];

/** Vizinhos de um hexágono que também estão no tabuleiro. */
export function hexNeighbors(hexId: HexId, onBoard: ReadonlySet<HexId>): HexId[] {
  const c = parseHexId(hexId);
  const out: HexId[] = [];
  for (const d of DIRS) {
    const n = toHexId({ q: c.q + d[0], r: c.r + d[1] });
    if (onBoard.has(n)) out.push(n);
  }
  return out;
}

function terrainBag(): Terrain[] {
  const bag: Terrain[] = [];
  for (const t of TERRAINS) {
    for (let i = 0; i < TERRAIN_DISTRIBUTION[t]; i++) bag.push(t);
  }
  return bag;
}

function hasAdjacentRedNumbers(
  numberByHex: Record<HexId, number | null>,
  hexOrder: readonly HexId[],
  onBoard: ReadonlySet<HexId>,
): boolean {
  for (const hid of hexOrder) {
    const n = numberByHex[hid];
    if (n === null || n === undefined || !RED_NUMBERS.includes(n)) continue;
    for (const nb of hexNeighbors(hid, onBoard)) {
      const m = numberByHex[nb];
      if (m !== null && m !== undefined && RED_NUMBERS.includes(m)) return true;
    }
  }
  return false;
}

/**
 * Tentativas máximas de reembaralhar as fichas no modo equilibrado. Estourar
 * este teto seria bug do gerador, não azar: a probabilidade de um layout
 * válido é da ordem de 10%, então 200 tentativas falharem seguidas é
 * praticamente impossível.
 */
const MAX_BALANCE_ATTEMPTS = 200;

export type GeneratedBoard = {
  board: BoardGraph;
  /** O deserto, onde o Saqueador começa (§3.2). */
  desertHex: HexId;
  cursor: number;
};

export function generateBoard(seed: string, cursor: number, mode: BoardMode): GeneratedBoard {
  const t = topology();
  const onBoard = new Set(t.hexOrder);

  // 1. Terrenos. Só embaralha uma vez: a restrição 6/8 é sobre números, não
  //    sobre terreno, então re-sortear terreno não ajudaria em nada.
  const terrainShuffle = shuffle(seed, cursor, terrainBag());
  let c = terrainShuffle.cursor;

  const terrainByHex: Record<HexId, Terrain> = {};
  let desertHex: HexId | null = null;
  t.hexOrder.forEach((hid, i) => {
    const terrain = terrainShuffle.items[i] as Terrain;
    terrainByHex[hid] = terrain;
    if (terrain === 'desert') desertHex = hid;
  });
  if (desertHex === null) throw new Error('gerador de tabuleiro: nenhum deserto foi colocado');

  const numberedHexes = t.hexOrder.filter((hid) => terrainByHex[hid] !== 'desert');

  // 2. Fichas numéricas, com a restrição de 6/8 não adjacentes no modo
  //    equilibrado. Cada nova tentativa consome mais cursor, o que mantém o
  //    resultado determinístico para uma dada seed.
  let numberByHex: Record<HexId, number | null> = {};
  for (let attempt = 0; ; attempt++) {
    const tokens = shuffle(seed, c, NUMBER_TOKENS);
    c = tokens.cursor;

    numberByHex = {};
    for (const hid of t.hexOrder) numberByHex[hid] = null;
    numberedHexes.forEach((hid, i) => {
      numberByHex[hid] = tokens.items[i] as number;
    });

    if (mode === 'random') break;
    if (!hasAdjacentRedNumbers(numberByHex, t.hexOrder, onBoard)) break;
    if (attempt >= MAX_BALANCE_ATTEMPTS) {
      throw new Error(
        `gerador de tabuleiro: não foi possível satisfazer a restrição 6/8 em ${MAX_BALANCE_ATTEMPTS} tentativas`,
      );
    }
  }

  // 3. Portos: as posições na costa são fixas, os tipos é que são sorteados.
  const portShuffle = shuffle(seed, c, PORT_DISTRIBUTION);
  c = portShuffle.cursor;

  const portByVertex: Record<VertexId, PortType> = {};
  PORT_COAST_INDEXES.forEach((coastIndex, i) => {
    const edgeId = t.coastLoop[coastIndex];
    if (edgeId === undefined) throw new Error('gerador de tabuleiro: costa menor que o esperado');
    const type = portShuffle.items[i] as PortType;
    for (const vid of parseEdgeId(edgeId)) portByVertex[vid] = type;
  });

  return {
    board: assembleBoard(terrainByHex, numberByHex, portByVertex),
    desertHex,
    cursor: c,
  };
}
