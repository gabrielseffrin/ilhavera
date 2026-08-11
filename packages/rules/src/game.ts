/**
 * Criação da partida: monta o estado inicial e entra na fase de preparação.
 */

import { generateBoard, type BoardMode } from './board/generate.js';
import { shuffle } from './rng.js';
import type { GameSettings, GameState, PlayerState } from './state.js';
import {
  BANK_PER_RESOURCE,
  DEFAULT_TARGET_VICTORY_POINTS,
  DEV_CARDS,
  DEV_CARD_DISTRIBUTION,
  PIECE_LIMITS,
  emptyResourceCount,
  type DevCard,
  type PlayerColor,
  type PlayerId,
} from './types.js';

export type CreateGameOptions = {
  id: string;
  seed: string;
  players: { id: PlayerId; name: string; color: PlayerColor }[];
  settings?: Partial<GameSettings>;
  /**
   * Se `false`, a ordem dos assentos é a ordem recebida. O padrão é sortear —
   * §3.2: "ordem de turno definida aleatoriamente".
   */
  shufflePlayerOrder?: boolean;
};

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 4;

function buildDevDeck(): DevCard[] {
  const deck: DevCard[] = [];
  for (const card of DEV_CARDS) {
    for (let i = 0; i < DEV_CARD_DISTRIBUTION[card]; i++) deck.push(card);
  }
  return deck;
}

export function createGame(options: CreateGameOptions): GameState {
  const { id, seed, players } = options;

  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`partida exige entre ${MIN_PLAYERS} e ${MAX_PLAYERS} jogadores`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new Error('IDs de jogador duplicados');
  }
  if (new Set(players.map((p) => p.color)).size !== players.length) {
    throw new Error('cores de jogador duplicadas');
  }

  const settings: GameSettings = {
    targetVictoryPoints: options.settings?.targetVictoryPoints ?? DEFAULT_TARGET_VICTORY_POINTS,
    boardMode: (options.settings?.boardMode ?? 'balanced') as BoardMode,
  };

  // A ordem de consumo do cursor faz parte do contrato de determinismo:
  // tabuleiro → baralho → ordem dos assentos. Mudar isso muda todas as
  // partidas já gravadas no log de ações.
  const generated = generateBoard(seed, 0, settings.boardMode);
  let cursor = generated.cursor;

  const deckShuffle = shuffle(seed, cursor, buildDevDeck());
  cursor = deckShuffle.cursor;

  const seating =
    options.shufflePlayerOrder === false ? { items: [...players], cursor } : shuffle(seed, cursor, players);
  cursor = seating.cursor;

  const playerStates: PlayerState[] = seating.items.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    resources: emptyResourceCount(),
    devCards: [],
    knightsPlayed: 0,
    piecesLeft: { ...PIECE_LIMITS },
    connected: true,
  }));

  const bank = emptyResourceCount();
  for (const r of Object.keys(bank) as (keyof typeof bank)[]) bank[r] = BANK_PER_RESOURCE;

  return {
    id,
    seed,
    rngCursor: cursor,
    version: 0,
    phase: 'setup1',
    settings,
    board: generated.board,
    // §3.2: o Saqueador começa no deserto.
    robberHex: generated.desertHex,
    currentPlayerIndex: 0,
    turnNumber: 0,
    setupStep: 'settlement',
    lastSetupVertex: null,
    players: playerStates,
    bank,
    devDeck: deckShuffle.items,
    buildings: {},
    roads: {},
    largestArmy: { owner: null, size: 0 },
    longestRoad: { owner: null, length: 0 },
    pendingDiscards: {},
    robberReturnPhase: 'main',
    activeTrade: null,
    tradeSeq: 0,
    freeRoadsRemaining: 0,
    devCardPlayedThisTurn: false,
    lastRoll: null,
    winner: null,
    log: [
      {
        type: 'gameStarted',
        data: { players: playerStates.map((p) => p.id), seed },
      },
    ],
  };
}
