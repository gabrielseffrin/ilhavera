/**
 * Invariantes de §8 do roadmap — as coisas que NUNCA podem quebrar, em nenhum
 * estado alcançável, em nenhuma partida.
 *
 * São checadas após **cada ação** no driver de testes de propriedade. É a rede
 * que pega o "bug sutil de regra que só aparece na partida 12" (§10).
 */

import {
  BANK_PER_RESOURCE,
  DEV_CARD_DISTRIBUTION,
  PIECE_LIMITS,
  RESOURCES,
  type PlayerId,
} from '../../src/types.js';
import type { GameState } from '../../src/state.js';

export type Violation = { invariant: string; detail: string };

const TOTAL_DEV_CARDS = Object.values(DEV_CARD_DISTRIBUTION).reduce((a, b) => a + b, 0);

export function checkInvariants(state: GameState): Violation[] {
  const out: Violation[] = [];
  const fail = (invariant: string, detail: string): void => {
    out.push({ invariant, detail });
  };

  // 1. Conservação de recursos: banco + mãos = 19 por recurso (95 no total).
  for (const r of RESOURCES) {
    const inHands = state.players.reduce((sum, p) => sum + p.resources[r], 0);
    const total = state.bank[r] + inHands;
    if (total !== BANK_PER_RESOURCE) {
      fail('conservação de recursos', `${r}: banco ${state.bank[r]} + mãos ${inHands} = ${total}`);
    }
  }

  // 2. Nenhum recurso negativo, em lugar nenhum.
  for (const r of RESOURCES) {
    if (state.bank[r] < 0) fail('recurso negativo', `banco ${r} = ${state.bank[r]}`);
    for (const p of state.players) {
      if (p.resources[r] < 0) fail('recurso negativo', `${p.id} ${r} = ${p.resources[r]}`);
    }
  }

  // 3. Conservação das Cartas de Progresso: baralho + distribuídas = 25.
  const distributed = state.players.reduce((sum, p) => sum + p.devCards.length, 0);
  if (state.devDeck.length + distributed !== TOTAL_DEV_CARDS) {
    fail(
      'conservação de cartas de progresso',
      `baralho ${state.devDeck.length} + distribuídas ${distributed} ≠ ${TOTAL_DEV_CARDS}`,
    );
  }

  // 4. Peças: o que está no tabuleiro + o que sobrou = o limite. Nunca excede.
  for (const p of state.players) {
    const roadsOnBoard = countRoads(state, p.id);
    const { settlements, cities } = countBuildings(state, p.id);

    if (roadsOnBoard + p.piecesLeft.roads !== PIECE_LIMITS.roads) {
      fail('peças de estrada', `${p.id}: ${roadsOnBoard} + ${p.piecesLeft.roads}`);
    }
    if (settlements + p.piecesLeft.settlements !== PIECE_LIMITS.settlements) {
      fail('peças de assentamento', `${p.id}: ${settlements} + ${p.piecesLeft.settlements}`);
    }
    if (cities + p.piecesLeft.cities !== PIECE_LIMITS.cities) {
      fail('peças de cidade', `${p.id}: ${cities} + ${p.piecesLeft.cities}`);
    }
    if (p.piecesLeft.roads < 0 || p.piecesLeft.settlements < 0 || p.piecesLeft.cities < 0) {
      fail('estoque de peças negativo', `${p.id}`);
    }
  }

  // 5. Regra de distância: nenhuma construção encosta em outra.
  for (const vertexId of Object.keys(state.buildings)) {
    const vertex = state.board.vertices[vertexId];
    if (vertex === undefined) {
      fail('construção fora do tabuleiro', vertexId);
      continue;
    }
    for (const neighbour of vertex.adjacentVertices) {
      if (state.buildings[neighbour] !== undefined) {
        fail('regra de distância', `${vertexId} encosta em ${neighbour}`);
      }
    }
  }

  // 6. Toda estrada encosta numa construção própria ou noutra estrada própria.
  for (const [edgeId, road] of Object.entries(state.roads)) {
    const edge = state.board.edges[edgeId];
    if (edge === undefined) {
      fail('estrada fora do tabuleiro', edgeId);
      continue;
    }
    const conectada = edge.vertices.some((v) => {
      const building = state.buildings[v];
      if (building !== undefined && building.owner === road.owner) return true;
      const vertex = state.board.vertices[v];
      return (vertex?.edges ?? []).some(
        (other) => other !== edgeId && state.roads[other]?.owner === road.owner,
      );
    });
    if (!conectada) fail('estrada desconectada', `${edgeId} de ${road.owner}`);
  }

  // 7. Soldados jogados nunca passam de 14 (o total do baralho).
  for (const p of state.players) {
    if (p.knightsPlayed > DEV_CARD_DISTRIBUTION.knight) {
      fail('soldados demais', `${p.id}: ${p.knightsPlayed}`);
    }
  }

  // 8. Descartes pendentes só existem na fase de descarte.
  if (Object.keys(state.pendingDiscards).length > 0 && state.phase !== 'discarding') {
    fail('descarte pendente fora da fase', state.phase);
  }

  // 9. O Saqueador está sempre num hexágono válido.
  if (state.board.hexes[state.robberHex] === undefined) {
    fail('saqueador fora do tabuleiro', state.robberHex);
  }

  // 10. Bônus só com o mínimo da regra.
  if (state.longestRoad.owner !== null && state.longestRoad.length < 5) {
    fail('estrada mais longa abaixo do mínimo', `${state.longestRoad.length}`);
  }
  if (state.largestArmy.owner !== null && state.largestArmy.size < 3) {
    fail('maior exército abaixo do mínimo', `${state.largestArmy.size}`);
  }

  return out;
}

function countRoads(state: GameState, playerId: PlayerId): number {
  let n = 0;
  for (const road of Object.values(state.roads)) if (road.owner === playerId) n++;
  return n;
}

function countBuildings(
  state: GameState,
  playerId: PlayerId,
): { settlements: number; cities: number } {
  let settlements = 0;
  let cities = 0;
  for (const b of Object.values(state.buildings)) {
    if (b.owner !== playerId) continue;
    if (b.type === 'city') cities++;
    else settlements++;
  }
  return { settlements, cities };
}

/**
 * Hash estável do estado, usado para provar que o replay do log com a mesma
 * seed reproduz a partida bit a bit. O tabuleiro entra só pela seed — ele é
 * derivado dela, e serializá-lo inteiro deixaria o hash caro sem ganho.
 */
export function hashState(state: GameState): string {
  const relevant = {
    seed: state.seed,
    rngCursor: state.rngCursor,
    phase: state.phase,
    robberHex: state.robberHex,
    currentPlayerIndex: state.currentPlayerIndex,
    turnNumber: state.turnNumber,
    setupStep: state.setupStep,
    lastSetupVertex: state.lastSetupVertex,
    bank: state.bank,
    devDeck: state.devDeck,
    buildings: sortedEntries(state.buildings),
    roads: sortedEntries(state.roads),
    players: state.players.map((p) => ({
      id: p.id,
      resources: p.resources,
      devCards: p.devCards,
      knightsPlayed: p.knightsPlayed,
      piecesLeft: p.piecesLeft,
    })),
    largestArmy: state.largestArmy,
    longestRoad: state.longestRoad,
    pendingDiscards: sortedEntries(state.pendingDiscards),
    activeTrade: state.activeTrade,
    freeRoadsRemaining: state.freeRoadsRemaining,
    devCardPlayedThisTurn: state.devCardPlayedThisTurn,
    winner: state.winner,
    log: state.log,
  };
  return JSON.stringify(relevant);
}

function sortedEntries<T>(record: Record<string, T>): [string, T][] {
  return Object.entries(record).sort((a, b) => a[0].localeCompare(b[0]));
}
