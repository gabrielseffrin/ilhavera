/**
 * Modelo de estado da partida — §4.4 e §4.5 do roadmap.
 */

import type { BoardGraph } from './board/graph.js';
import type { BoardMode } from './board/generate.js';
import type {
  BuildingType,
  DevCard,
  EdgeId,
  HexId,
  PlayerColor,
  PlayerId,
  Resource,
  ResourceCount,
  VertexId,
} from './types.js';

/**
 * Máquina de estados da partida (§4.4). Cada fase define exatamente quais
 * ações são legais e por quem; `reduce` rejeita qualquer coisa fora disso.
 */
export type Phase =
  | 'lobby'
  | 'setup1' // ordem normal
  | 'setup2' // ordem inversa; o 2º assentamento produz recursos
  | 'awaitingRoll'
  | 'discarding' // rolou 7: descartes acontecem em paralelo
  | 'movingRobber'
  | 'main'
  | 'finished';

/** Dentro do setup, cada jogador coloca 1 assentamento e depois 1 estrada. */
export type SetupStep = 'settlement' | 'road';

export type OwnedDevCard = {
  card: DevCard;
  /** Número do turno global em que foi comprada — base da regra "não no mesmo turno". */
  boughtOnTurn: number;
  played: boolean;
};

export type PlayerState = {
  id: PlayerId;
  name: string;
  color: PlayerColor;
  /** OCULTO para os demais: só o total agregado é público (§4.5). */
  resources: ResourceCount;
  /** OCULTO para os demais: só a contagem é pública (§4.5). */
  devCards: OwnedDevCard[];
  knightsPlayed: number;
  piecesLeft: { roads: number; settlements: number; cities: number };
  connected: boolean;
};

/**
 * Termos de uma negociação, **sempre do ponto de vista do jogador da vez**.
 * `give` é o que ele entrega; `receive` é o que ele recebe. Manter um único
 * referencial evita o clássico bug de inverter os lados numa contraproposta.
 */
export type TradeTerms = { give: ResourceCount; receive: ResourceCount };

export type TradeResponse =
  { type: 'accept' } | { type: 'decline' } | { type: 'counter'; terms: TradeTerms };

export type ActiveTrade = {
  id: string;
  /** Sempre o jogador da vez — §3.5: só ele pode iniciar propostas. */
  proposer: PlayerId;
  terms: TradeTerms;
  targets: PlayerId[];
  responses: Record<PlayerId, TradeResponse>;
};

export type Building = { owner: PlayerId; type: BuildingType };
export type Road = { owner: PlayerId };

export type GameSettings = {
  targetVictoryPoints: number;
  boardMode: BoardMode;
};

export type GameState = {
  id: string;
  seed: string;
  /** Posição do PRNG. É o que permite replay determinístico (§4.1). */
  rngCursor: number;
  version: number;
  phase: Phase;
  settings: GameSettings;
  board: BoardGraph;
  robberHex: HexId;
  currentPlayerIndex: number;
  /** Contador global de turnos (não de rodadas). Começa em 1 após o setup. */
  turnNumber: number;
  setupStep: SetupStep;
  /** No setup, a estrada tem que encostar no assentamento recém-colocado. */
  lastSetupVertex: VertexId | null;
  players: PlayerState[];
  bank: ResourceCount;
  /** OCULTO — nunca serializado ao cliente; só o tamanho é público. */
  devDeck: DevCard[];
  buildings: Record<VertexId, Building>;
  roads: Record<EdgeId, Road>;
  largestArmy: { owner: PlayerId | null; size: number };
  longestRoad: { owner: PlayerId | null; length: number };
  /** Quantas cartas cada jogador ainda precisa descartar (§3.3). */
  pendingDiscards: Record<PlayerId, number>;
  /**
   * Para onde voltar depois de mover o Saqueador. Um Soldado jogado ANTES da
   * rolagem devolve para `awaitingRoll`; um 7 rolado devolve para `main`.
   */
  robberReturnPhase: 'main' | 'awaitingRoll';
  activeTrade: ActiveTrade | null;
  tradeSeq: number;
  /** Carta Construção de Estradas: estradas grátis ainda por colocar. */
  freeRoadsRemaining: number;
  devCardPlayedThisTurn: boolean;
  lastRoll: { dice: [number, number]; total: number } | null;
  winner: PlayerId | null;
  log: GameEvent[];
};

export type GameEvent =
  | { type: 'gameStarted'; data: { players: PlayerId[]; seed: string } }
  | { type: 'settlementPlaced'; actor: PlayerId; data: { vertexId: VertexId; free: boolean } }
  | { type: 'roadPlaced'; actor: PlayerId; data: { edgeId: EdgeId; free: boolean } }
  | { type: 'cityBuilt'; actor: PlayerId; data: { vertexId: VertexId } }
  | { type: 'diceRolled'; actor: PlayerId; data: { dice: [number, number]; total: number } }
  | {
      type: 'resourcesProduced';
      data: {
        gains: Record<PlayerId, ResourceCount>;
        /** Recursos que ninguém recebeu por escassez do banco (§3.3). */
        blockedByBank: Resource[];
      };
    }
  | { type: 'setupProduction'; actor: PlayerId; data: { gains: ResourceCount } }
  | { type: 'discardRequired'; data: { counts: Record<PlayerId, number> } }
  | { type: 'discarded'; actor: PlayerId; data: { resources: ResourceCount } }
  | { type: 'robberMoved'; actor: PlayerId; data: { hexId: HexId } }
  | {
      type: 'stolen';
      actor: PlayerId;
      /** `resource` é informação oculta de terceiros — filtrada em `toClientView`. */
      data: { from: PlayerId; resource: Resource | null };
    }
  | { type: 'devCardBought'; actor: PlayerId; data: { deckLeft: number } }
  | { type: 'devCardPlayed'; actor: PlayerId; data: { card: DevCard } }
  | {
      type: 'monopolyResolved';
      actor: PlayerId;
      data: { resource: Resource; taken: Record<PlayerId, number> };
    }
  | { type: 'yearOfPlentyResolved'; actor: PlayerId; data: { resources: Resource[] } }
  | {
      type: 'bankTraded';
      actor: PlayerId;
      data: { give: Resource; receive: Resource; rate: number };
    }
  | {
      type: 'tradeOffered';
      actor: PlayerId;
      data: { tradeId: string; terms: TradeTerms; targets: PlayerId[] };
    }
  | {
      type: 'tradeResponded';
      actor: PlayerId;
      data: { tradeId: string; response: TradeResponse };
    }
  | {
      type: 'tradeCompleted';
      actor: PlayerId;
      data: { tradeId: string; partner: PlayerId; terms: TradeTerms };
    }
  | { type: 'longestRoadChanged'; data: { owner: PlayerId | null; length: number } }
  | { type: 'largestArmyChanged'; data: { owner: PlayerId | null; size: number } }
  | { type: 'turnEnded'; actor: PlayerId; data: { nextPlayer: PlayerId; turnNumber: number } }
  | { type: 'gameWon'; actor: PlayerId; data: { victoryPoints: number } };

export type GameEventType = GameEvent['type'];
