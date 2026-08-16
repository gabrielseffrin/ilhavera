/**
 * Como se diz, em voz alta, um lugar no tabuleiro.
 *
 * `vertexId` é `"q,r|q,r|q,r"` e `edgeId` é dois desses colados. São ótimos
 * identificadores e péssimas descrições: quem não está vendo o desenho não tem o
 * que fazer com eles.
 *
 * O que localiza um ponto, para quem joga, são os hexágonos em volta — "entre a
 * Floresta 11 e a Colina 6" é como uma pessoa aponta um lugar para outra na
 * mesa. É essa a descrição usada nos `aria-label` dos alvos e nos rótulos do
 * tabuleiro.
 *
 * ## Por que não é `describeVertex` do motor
 *
 * `packages/rules/src/narrate.ts` já descreve vértices e arestas, e para um
 * bom motivo: a CLI e o histórico precisam disso desde a Fase 1. A diferença
 * não é acidente — é **pontuação**, e pontuação é tudo quando o texto vai ser
 * falado em voz alta.
 *
 * | onde                | como sai                          | para quem       |
 * | ------------------- | --------------------------------- | --------------- |
 * | `describeVertex`    | `Floresta-11/Colina-6 [Porto 3:1]`| olho, log, CLI  |
 * | `descreverVertice`  | `Floresta 11, Colina 6 e Pasto 3` | leitor de tela  |
 *
 * A forma do motor é compacta e ótima numa linha de histórico; lida por um
 * sintetizador de voz, vira "Floresta traço onze barra Colina traço seis". A
 * daqui é prosa, com vírgula e "e" no último — e é só isso que muda.
 *
 * As duas leem o mesmo `vertex.hexes` e não podem discordar sobre **quais**
 * hexágonos são: a lista vem do grafo. O que cada uma escolhe é como pontuar.
 *
 * Fica em `apps/web` e não no motor porque é texto de interface: a CLI não tem
 * leitor de tela, e `packages/rules` não deve carregar uma segunda forma de
 * dizer a mesma coisa para um consumidor que ele não tem.
 */

import {
  TERRAIN_LABELS,
  type BoardGraph,
  type EdgeId,
  type HexId,
  type VertexId,
} from '@ilhavera/rules';

/** "Floresta 11", ou só "Deserto" quando não há ficha. */
export function nomeDoHexagono(board: BoardGraph, hexId: HexId): string {
  const hex = board.hexes[hexId];
  if (hex === undefined) return 'fora do tabuleiro';
  return hex.number === null
    ? TERRAIN_LABELS[hex.terrain]
    : `${TERRAIN_LABELS[hex.terrain]} ${hex.number}`;
}

/** "a, b e c" — a vírgula de sempre, com "e" no último. */
function lista(partes: string[]): string {
  if (partes.length === 0) return 'a água';
  if (partes.length === 1) return partes[0] as string;
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1] as string}`;
}

/**
 * Um vértice é a interseção de até três hexágonos — os de borda tocam menos,
 * porque os outros são água e não entram no grafo.
 */
export function descreverVertice(board: BoardGraph, vertexId: VertexId): string {
  const hexes = board.vertices[vertexId]?.hexes ?? [];
  return lista(hexes.map((h) => nomeDoHexagono(board, h)));
}

/**
 * Uma aresta corre entre os hexágonos que os **dois** extremos dela tocam.
 *
 * Na borda do tabuleiro isso pode dar um só, e a descrição vira "ao lado da
 * Montanha 8" em vez de "entre X e Y" — o que continua sendo mais útil do que
 * repetir os dois vértices.
 */
export function descreverAresta(board: BoardGraph, edgeId: EdgeId): string {
  const aresta = board.edges[edgeId];
  if (aresta === undefined) return 'fora do tabuleiro';

  const [a, b] = aresta.vertices;
  const deA = board.vertices[a]?.hexes ?? [];
  const deB = new Set(board.vertices[b]?.hexes ?? []);
  const comuns = deA.filter((h) => deB.has(h));

  return lista(comuns.map((h) => nomeDoHexagono(board, h)));
}
