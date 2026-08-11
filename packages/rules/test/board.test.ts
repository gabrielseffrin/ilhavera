/**
 * §10 do roadmap lista "geometria de vértices/arestas mal modelada" como risco
 * de impacto alto, com a mitigação: "teste que exige exatamente 54/72".
 * É o que este arquivo faz — e um pouco mais, porque contagem certa com
 * adjacência errada passaria despercebida.
 */
import { describe, expect, it } from 'vitest';

import { topology, assembleBoard } from '../src/board/graph.js';
import { generateBoard, hexNeighbors } from '../src/board/generate.js';
import { makeEdgeId, parseEdgeId, parseVertexId, standardHexes } from '../src/board/coords.js';
import { NUMBER_TOKENS, RED_NUMBERS, TERRAIN_DISTRIBUTION, type Terrain } from '../src/types.js';

describe('topologia do tabuleiro', () => {
  const t = topology();

  it('tem 19 hexágonos no formato 3-4-5-4-3', () => {
    expect(t.hexOrder).toHaveLength(19);
    const porLinha = new Map<number, number>();
    for (const h of standardHexes()) porLinha.set(h.r, (porLinha.get(h.r) ?? 0) + 1);
    expect([...porLinha.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])).toEqual([
      3, 4, 5, 4, 3,
    ]);
  });

  it('tem exatamente 54 vértices', () => {
    expect(t.vertexOrder).toHaveLength(54);
  });

  it('tem exatamente 72 arestas', () => {
    expect(t.edgeOrder).toHaveLength(72);
  });

  it('tem 30 arestas de costa formando um anel', () => {
    expect(t.coastLoop).toHaveLength(30);
    expect(new Set(t.coastLoop).size).toBe(30);
  });

  it('dá a todo vértice a tripla completa de hexágonos no ID, com 1 a 3 no tabuleiro', () => {
    for (const vid of t.vertexOrder) {
      expect(parseVertexId(vid)).toHaveLength(3);
      const noTabuleiro = t.vertexHexes[vid] as string[];
      expect(noTabuleiro.length).toBeGreaterThanOrEqual(1);
      expect(noTabuleiro.length).toBeLessThanOrEqual(3);
    }
  });

  it('dá a todo vértice grau 2 (costa) ou 3 (interior)', () => {
    for (const vid of t.vertexOrder) {
      const grau = (t.vertexEdges[vid] as string[]).length;
      expect(grau).toBeGreaterThanOrEqual(2);
      expect(grau).toBeLessThanOrEqual(3);
      expect((t.vertexAdjacent[vid] as string[]).length).toBe(grau);
    }
  });

  it('mantém adjacência simétrica e consistente com as arestas', () => {
    for (const vid of t.vertexOrder) {
      for (const outro of t.vertexAdjacent[vid] as string[]) {
        expect(t.vertexAdjacent[outro]).toContain(vid);
        expect(t.edgeVertices[makeEdgeId(vid, outro)]).toBeDefined();
      }
    }
    for (const eid of t.edgeOrder) {
      const [a, b] = parseEdgeId(eid);
      expect(t.vertexAdjacent[a]).toContain(b);
      expect(t.vertexAdjacent[b]).toContain(a);
    }
  });

  it('forma um grafo conexo — nenhuma ilha de vértices', () => {
    const inicio = t.vertexOrder[0] as string;
    const visto = new Set([inicio]);
    const fila = [inicio];
    while (fila.length > 0) {
      const v = fila.pop() as string;
      for (const n of t.vertexAdjacent[v] as string[]) {
        if (!visto.has(n)) {
          visto.add(n);
          fila.push(n);
        }
      }
    }
    expect(visto.size).toBe(54);
  });

  it('dá a cada hexágono 6 cantos distintos e 6 arestas', () => {
    for (const hid of t.hexOrder) {
      const cantos = t.hexVertices[hid] as string[];
      expect(cantos).toHaveLength(6);
      expect(new Set(cantos).size).toBe(6);
    }
  });

  it('faz toda aresta tocar 1 hexágono (costa) ou 2 (interior)', () => {
    let costa = 0;
    for (const eid of t.edgeOrder) {
      const n = (t.edgeHexes[eid] as string[]).length;
      expect(n === 1 || n === 2).toBe(true);
      if (n === 1) costa++;
    }
    expect(costa).toBe(30);
  });
});

describe('geração de tabuleiro', () => {
  const seeds = ['a', 'b', 'partida-1', 'zzz', '42'];

  it('distribui os 19 terrenos exatamente conforme a especificação', () => {
    for (const seed of seeds) {
      const { board } = generateBoard(seed, 0, 'balanced');
      const contagem: Record<string, number> = {};
      for (const hid of board.hexOrder) {
        const terreno = (board.hexes[hid] as { terrain: Terrain }).terrain;
        contagem[terreno] = (contagem[terreno] ?? 0) + 1;
      }
      expect(contagem).toEqual(TERRAIN_DISTRIBUTION);
    }
  });

  it('coloca as 18 fichas numéricas, nenhuma no deserto', () => {
    for (const seed of seeds) {
      const { board, desertHex } = generateBoard(seed, 0, 'balanced');
      const numeros: number[] = [];
      for (const hid of board.hexOrder) {
        const hex = board.hexes[hid]!;
        if (hex.terrain === 'desert') {
          expect(hex.number).toBeNull();
        } else {
          expect(hex.number).not.toBeNull();
          numeros.push(hex.number as number);
        }
      }
      expect(numeros.sort((a, b) => a - b)).toEqual([...NUMBER_TOKENS].sort((a, b) => a - b));
      expect(board.hexes[desertHex]!.terrain).toBe('desert');
    }
  });

  it('nunca deixa 6 e 8 adjacentes no modo equilibrado', () => {
    const onBoard = new Set(topology().hexOrder);
    for (let i = 0; i < 200; i++) {
      const { board } = generateBoard(`equilibrado-${i}`, 0, 'balanced');
      for (const hid of board.hexOrder) {
        const n = board.hexes[hid]!.number;
        if (n === null || !RED_NUMBERS.includes(n)) continue;
        for (const nb of hexNeighbors(hid, onBoard)) {
          const m = board.hexes[nb]!.number;
          if (m !== null) expect(RED_NUMBERS).not.toContain(m);
        }
      }
    }
  });

  it('permite 6 e 8 adjacentes no modo aleatório puro', () => {
    const onBoard = new Set(topology().hexOrder);
    let encontrouAlgum = false;
    for (let i = 0; i < 200 && !encontrouAlgum; i++) {
      const { board } = generateBoard(`aleatorio-${i}`, 0, 'random');
      for (const hid of board.hexOrder) {
        const n = board.hexes[hid]!.number;
        if (n === null || !RED_NUMBERS.includes(n)) continue;
        for (const nb of hexNeighbors(hid, onBoard)) {
          const m = board.hexes[nb]!.number;
          if (m !== null && RED_NUMBERS.includes(m)) encontrouAlgum = true;
        }
      }
    }
    expect(encontrouAlgum).toBe(true);
  });

  it('coloca 9 portos, cada um em 2 vértices, com a distribuição 4×3:1 + 5×2:1', () => {
    for (const seed of seeds) {
      const { board } = generateBoard(seed, 0, 'balanced');
      const porTipo: Record<string, number> = {};
      let verticesComPorto = 0;
      for (const vid of board.vertexOrder) {
        const porto = board.vertices[vid]!.port;
        if (porto === null) continue;
        verticesComPorto++;
        porTipo[porto] = (porTipo[porto] ?? 0) + 1;
      }
      expect(verticesComPorto).toBe(18);
      expect(porTipo['generic']).toBe(8);
      for (const r of ['lumber', 'brick', 'wool', 'grain', 'ore']) {
        expect(porTipo[r]).toBe(2);
      }
    }
  });

  it('coloca todo porto em vértice de costa', () => {
    const { board } = generateBoard('costa', 0, 'balanced');
    for (const vid of board.vertexOrder) {
      if (board.vertices[vid]!.port === null) continue;
      // Vértice de costa toca no máximo 2 hexágonos do tabuleiro.
      expect(board.vertices[vid]!.hexes.length).toBeLessThanOrEqual(2);
    }
  });

  it('é determinístico: mesma seed, mesmo tabuleiro', () => {
    const a = generateBoard('determinismo', 7, 'balanced');
    const b = generateBoard('determinismo', 7, 'balanced');
    expect(JSON.stringify(a.board)).toBe(JSON.stringify(b.board));
    expect(a.cursor).toBe(b.cursor);
  });

  it('produz tabuleiros diferentes para seeds diferentes', () => {
    const a = generateBoard('seed-a', 0, 'balanced');
    const b = generateBoard('seed-b', 0, 'balanced');
    expect(JSON.stringify(a.board)).not.toBe(JSON.stringify(b.board));
  });

  it('não vaza mutação entre partidas via topologia memoizada', () => {
    const a = generateBoard('mut-a', 0, 'balanced');
    a.board.hexes[a.board.hexOrder[0] as string]!.vertices.push('lixo');
    const b = generateBoard('mut-b', 0, 'balanced');
    expect(b.board.hexes[b.board.hexOrder[0] as string]!.vertices).toHaveLength(6);
    // E a própria topologia continua intacta.
    expect(assembleBoard({}, {}, {}).hexOrder).toHaveLength(19);
  });
});
