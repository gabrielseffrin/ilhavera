/**
 * Projeção por jogador — §4.5 do roadmap.
 *
 * **Esta é a fronteira de segurança do jogo.** O servidor nunca serializa o
 * `GameState` cru para um cliente: passa por aqui primeiro. O que sai daqui
 * pode ir para a rede; o que não sai, não existe para aquele jogador.
 *
 * Informação oculta filtrada:
 * - mão de recursos alheia → só o total agregado;
 * - Cartas de Progresso alheias → só a contagem (e os Soldados já jogados,
 *   que são públicos por definição);
 * - baralho de Cartas de Progresso → só o tamanho;
 * - cartas de Ponto de Vitória alheias → não entram na pontuação pública;
 * - **o log de eventos** → qual recurso foi roubado num assalto só é visível
 *   para ladrão e vítima. Este é o vazamento fácil de esquecer: filtra-se o
 *   estado e deixa-se o histórico contando tudo.
 */

import type { BoardGraph } from './board/graph.js';
import type {
  ActiveTrade,
  Building,
  GameEvent,
  GameSettings,
  GameState,
  OwnedDevCard,
  Phase,
  Road,
} from './state.js';
import type {
  EdgeId,
  HexId,
  PlayerColor,
  PlayerId,
  PortType,
  ResourceCount,
  VertexId,
} from './types.js';
import { countResources, playerPorts } from './query.js';
import { victoryPoints } from './scoring/victory.js';

export type PublicPlayerView = {
  id: PlayerId;
  name: string;
  color: PlayerColor;
  connected: boolean;
  /** Só o total: quais cartas são exatamente é informação oculta. */
  resourceCount: number;
  /** Só a contagem: quais cartas são exatamente é informação oculta. */
  devCardCount: number;
  /** Soldados jogados ficam virados para cima — informação pública. */
  knightsPlayed: number;
  piecesLeft: { roads: number; settlements: number; cities: number };
  ports: PortType[];
  /** Pontuação sem as cartas de Ponto de Vitória ocultas. */
  victoryPointsPublic: number;
};

export type SelfPlayerView = PublicPlayerView & {
  resources: ResourceCount;
  devCards: OwnedDevCard[];
  /** Pontuação real, incluindo as próprias cartas de PV. */
  victoryPointsTotal: number;
};

export type ClientView = {
  id: string;
  version: number;
  phase: Phase;
  settings: GameSettings;
  board: BoardGraph;
  robberHex: HexId;
  currentPlayerIndex: number;
  turnNumber: number;
  setupStep: GameState['setupStep'];
  lastSetupVertex: VertexId | null;
  players: PublicPlayerView[];
  /** `null` para espectadores. */
  you: SelfPlayerView | null;
  bank: ResourceCount;
  devDeckSize: number;
  buildings: Record<VertexId, Building>;
  roads: Record<EdgeId, Road>;
  largestArmy: { owner: PlayerId | null; size: number };
  longestRoad: { owner: PlayerId | null; length: number };
  pendingDiscards: Record<PlayerId, number>;
  activeTrade: ActiveTrade | null;
  freeRoadsRemaining: number;
  devCardPlayedThisTurn: boolean;
  lastRoll: { dice: [number, number]; total: number } | null;
  winner: PlayerId | null;
  log: GameEvent[];
};

/**
 * A parte da projeção que **nunca muda** depois de `createGame`.
 *
 * O `board` é quase toda a projeção em bytes — 54 vértices com adjacências e
 * pixels, 72 arestas, 19 hexágonos — e é constante da primeira jogada à última.
 * Reenviá-lo a cada `state:patch`, para cada jogador, numa partida de centenas
 * de ações, seria mandar o tabuleiro inteiro algumas centenas de vezes para não
 * dizer nada de novo. O snapshot manda; o patch não repete.
 */
export type ClientViewStatic = Pick<ClientView, 'id' | 'settings' | 'board'>;

/**
 * O que muda a cada jogada — tudo menos o estático e o log.
 *
 * O log fica de fora porque só cresce, e por acréscimo: o `state:patch` já
 * carrega os eventos daquela jogada, e o cliente os concatena. Mandá-lo inteiro
 * seria reenviar o histórico da partida a cada jogada dela.
 */
export type ClientViewDynamic = Omit<ClientView, keyof ClientViewStatic | 'log'>;

function publicPlayer(state: GameState, id: PlayerId): PublicPlayerView {
  const p = state.players.find((x) => x.id === id);
  if (p === undefined) throw new Error(`jogador desconhecido: ${id}`);
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    connected: p.connected,
    resourceCount: countResources(p.resources),
    devCardCount: p.devCards.filter((c) => !c.played).length,
    knightsPlayed: p.knightsPlayed,
    piecesLeft: { ...p.piecesLeft },
    ports: playerPorts(state, p.id),
    victoryPointsPublic: victoryPoints(state, p.id, false).total,
  };
}

/**
 * Filtra um evento. Hoje a única informação oculta em evento é qual recurso foi
 * roubado; ladrão e vítima veem, o resto da mesa só vê que houve roubo.
 */
export function projectEvent(event: GameEvent, viewerId: PlayerId | null): GameEvent {
  if (event.type !== 'stolen') return event;
  if (viewerId !== null && (viewerId === event.actor || viewerId === event.data.from)) {
    return event;
  }
  return { ...event, data: { from: event.data.from, resource: null } };
}

/**
 * Filtra uma leva de eventos para um espectador.
 *
 * Existe para o `state:patch` do servidor (§5.2): o `reduce` devolve os eventos
 * crus da ação, e mandá-los para a sala inteira vazaria o roubo — o mesmo
 * descuido contra o qual o cabeçalho deste arquivo avisa, só que pelo canal do
 * delta em vez do canal do estado. Quem emite estado passa por aqui ou por
 * `toClientView`, nunca direto.
 */
export function projectEvents(
  events: readonly GameEvent[],
  viewerId: PlayerId | null,
): GameEvent[] {
  return events.map((e) => projectEvent(e, viewerId));
}

export function toClientViewStatic(state: GameState): ClientViewStatic {
  return {
    id: state.id,
    settings: { ...state.settings },
    board: state.board,
  };
}

export function toClientViewDynamic(
  state: GameState,
  viewerId: PlayerId | null,
): ClientViewDynamic {
  const self = viewerId === null ? undefined : state.players.find((p) => p.id === viewerId);

  const you: SelfPlayerView | null =
    self === undefined
      ? null
      : {
          ...publicPlayer(state, self.id),
          resources: { ...self.resources },
          devCards: self.devCards.map((c) => ({ ...c })),
          victoryPointsTotal: victoryPoints(state, self.id, true).total,
        };

  return {
    version: state.version,
    phase: state.phase,
    robberHex: state.robberHex,
    currentPlayerIndex: state.currentPlayerIndex,
    turnNumber: state.turnNumber,
    setupStep: state.setupStep,
    lastSetupVertex: state.lastSetupVertex,
    players: state.players.map((p) => publicPlayer(state, p.id)),
    you,
    bank: { ...state.bank },
    // O conteúdo e a ORDEM do baralho nunca saem do servidor. Só o tamanho.
    devDeckSize: state.devDeck.length,
    buildings: state.buildings,
    roads: state.roads,
    largestArmy: { ...state.largestArmy },
    longestRoad: { ...state.longestRoad },
    pendingDiscards: { ...state.pendingDiscards },
    activeTrade: state.activeTrade,
    freeRoadsRemaining: state.freeRoadsRemaining,
    devCardPlayedThisTurn: state.devCardPlayedThisTurn,
    lastRoll: state.lastRoll === null ? null : { ...state.lastRoll },
    winner: state.winner,
  };
}

/**
 * A projeção completa. Composta das duas metades de propósito: acrescentar um
 * campo a `ClientView` sem colocá-lo numa das metades para de compilar aqui, que
 * é exatamente onde se quer descobrir que o `state:patch` deixou de contar algo.
 */
export function toClientView(state: GameState, viewerId: PlayerId | null): ClientView {
  return {
    ...toClientViewStatic(state),
    ...toClientViewDynamic(state, viewerId),
    log: projectEvents(state.log, viewerId),
  };
}

/**
 * Remonta a projeção no cliente a partir de um `state:patch`.
 *
 * O cliente não tem motor: ele não deriva o estado novo dos eventos, ele o
 * **recebe**. Os eventos entram só no log, e entram por acréscimo porque já vêm
 * projetados por `projectEvents` — a mesma filtragem que `toClientView` aplica
 * ao log inteiro. Concatenar é exato, não aproximação.
 */
export function applyClientViewPatch(
  anterior: ClientView,
  dynamic: ClientViewDynamic,
  events: readonly GameEvent[],
): ClientView {
  return { ...anterior, ...dynamic, log: [...anterior.log, ...events] };
}
