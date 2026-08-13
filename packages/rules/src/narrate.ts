/**
 * Eventos e ações do motor em português.
 *
 * Este arquivo nasceu no `apps/cli` e subiu para cá quando a Fase 3 precisou do
 * mesmo texto na tela. Podia ter virado uma segunda tradução no navegador — e
 * seria a mesma escolha que §6.1 rejeita para as regras: duas implementações do
 * mesmo assunto divergem, e a que diverge calada é a de texto, porque nenhum
 * teste reclama de uma frase desatualizada.
 *
 * Duas decisões sustentam o reaproveitamento:
 *
 * - **`NarrationScope`, e não `GameState`.** Só se pede o tabuleiro e o nome e
 *   a cor de cada jogador. `GameState` e `ClientView` satisfazem a forma sem
 *   conversão, então o mesmo texto serve o servidor, a CLI e o navegador — e
 *   continua servindo quando a Fase 4 trocar a origem do estado.
 * - **`playerName` é injetado.** É o único ponto em que a CLI difere: ela
 *   embrulha o nome em código ANSI. Cor de terminal não sobe para o motor.
 *
 * O `switch` de `describeEvent` não tem `default` de propósito: variante nova
 * de evento sem narração não compila.
 */

import type { BoardGraph } from './board/graph.js';
import type { GameEvent } from './state.js';
import type { Action, ActionType } from './actions/types.js';
import type {
  EdgeId,
  HexId,
  PlayerColor,
  PlayerId,
  ResourceCount,
  VertexId,
} from './types.js';
import { RESOURCES } from './types.js';
import {
  DEV_CARD_LABELS,
  LARGEST_ARMY_LABEL,
  LONGEST_ROAD_LABEL,
  RESOURCE_LABELS,
  ROBBER_LABEL,
  TERRAIN_LABELS,
  portLabel,
} from './labels.js';

/**
 * O mínimo para narrar. `GameState['players']` e `ClientView['players']`
 * satisfazem os dois campos, que é o que faz a narração atravessar a projeção.
 */
export type NarrationScope = {
  board: BoardGraph;
  players: readonly { id: PlayerId; name: string; color: PlayerColor }[];
};

export type NarrationOptions = {
  /** Como escrever o nome de um jogador. Padrão: o nome cru, sem enfeite. */
  playerName?: (id: PlayerId) => string;
};

function nome(scope: NarrationScope, id: PlayerId, options?: NarrationOptions): string {
  if (options?.playerName !== undefined) return options.playerName(id);
  return scope.players.find((p) => p.id === id)?.name ?? id;
}

/** Um vértice pelo que ele toca: é assim que um jogador o identifica na mesa. */
export function describeVertex(board: BoardGraph, vertexId: VertexId): string {
  const vertex = board.vertices[vertexId];
  if (vertex === undefined) return vertexId;

  const partes = vertex.hexes.map((h) => {
    const hex = board.hexes[h];
    if (hex === undefined) return h;
    const numero = hex.number === null ? '' : `-${hex.number}`;
    return `${TERRAIN_LABELS[hex.terrain]}${numero}`;
  });
  const porto = vertex.port === null ? '' : ` [${portLabel(vertex.port)}]`;
  return `${partes.join('/')}${porto}`;
}

export function describeEdge(board: BoardGraph, edgeId: EdgeId): string {
  const edge = board.edges[edgeId];
  if (edge === undefined) return edgeId;
  return `entre ${describeVertex(board, edge.vertices[0])} e ${describeVertex(board, edge.vertices[1])}`;
}

export function describeHex(board: BoardGraph, hexId: HexId): string {
  const hex = board.hexes[hexId];
  if (hex === undefined) return hexId;
  const numero = hex.number === null ? 'sem ficha' : `ficha ${hex.number}`;
  return `${TERRAIN_LABELS[hex.terrain]} (${numero})`;
}

export function describeResources(counts: ResourceCount): string {
  const partes = RESOURCES.filter((r) => counts[r] > 0).map(
    (r) => `${counts[r]}× ${RESOURCE_LABELS[r]}`,
  );
  return partes.length === 0 ? 'nada' : partes.join(', ');
}

/**
 * Uma linha de log para cada evento do motor.
 *
 * Cinco das variantes não têm `actor` — `gameStarted`, `resourcesProduced`,
 * `discardRequired`, `longestRoadChanged` e `largestArmyChanged` — porque são
 * acontecimentos da mesa, não de alguém. Quem consome isto e quiser pintar o
 * nome do ator precisa testar `'actor' in evento`, não confiar que existe.
 */
export function describeEvent(
  scope: NarrationScope,
  event: GameEvent,
  options?: NarrationOptions,
): string {
  const quem = (id: PlayerId): string => nome(scope, id, options);
  const board = scope.board;

  switch (event.type) {
    case 'gameStarted':
      return `Partida iniciada (semente ${event.data.seed}).`;
    case 'settlementPlaced':
      return `${quem(event.actor)} colocou um assentamento em ${describeVertex(board, event.data.vertexId)}.`;
    case 'roadPlaced':
      return `${quem(event.actor)} colocou uma estrada ${describeEdge(board, event.data.edgeId)}${event.data.free ? ' (grátis)' : ''}.`;
    case 'cityBuilt':
      return `${quem(event.actor)} construiu uma cidade em ${describeVertex(board, event.data.vertexId)}.`;
    case 'diceRolled':
      return `${quem(event.actor)} rolou ${event.data.dice[0]} + ${event.data.dice[1]} = ${event.data.total}.`;
    case 'resourcesProduced': {
      const ganhos = Object.entries(event.data.gains)
        .map(([id, counts]) => `${quem(id)}: ${describeResources(counts)}`)
        .join(' | ');
      const bloqueados =
        event.data.blockedByBank.length === 0
          ? ''
          : ` (banco sem estoque: ${event.data.blockedByBank.map((r) => RESOURCE_LABELS[r]).join(', ')})`;
      return `Produção — ${ganhos === '' ? 'ninguém produziu' : ganhos}${bloqueados}`;
    }
    case 'setupProduction':
      return `${quem(event.actor)} recebeu ${describeResources(event.data.gains)} pelo segundo assentamento.`;
    case 'discardRequired': {
      const alvos = Object.entries(event.data.counts)
        .map(([id, n]) => `${quem(id)} (${n})`)
        .join(', ');
      return `Saiu 7 — descarte obrigatório: ${alvos}.`;
    }
    case 'discarded':
      return `${quem(event.actor)} descartou ${describeResources(event.data.resources)}.`;
    case 'robberMoved':
      return `${quem(event.actor)} moveu o ${ROBBER_LABEL} para ${describeHex(board, event.data.hexId)}.`;
    case 'stolen': {
      // `resource` vem nulo quando quem lê não é ladrão nem vítima: a projeção
      // de §4.5 filtra o log, não só o estado.
      const carta =
        event.data.resource === null ? 'uma carta' : `1× ${RESOURCE_LABELS[event.data.resource]}`;
      return `${quem(event.actor)} roubou ${carta} de ${quem(event.data.from)}.`;
    }
    case 'devCardBought':
      return `${quem(event.actor)} comprou uma Carta de Progresso (restam ${event.data.deckLeft}).`;
    case 'devCardPlayed':
      return `${quem(event.actor)} jogou ${DEV_CARD_LABELS[event.data.card]}.`;
    case 'monopolyResolved': {
      const total = Object.values(event.data.taken).reduce((a, b) => a + b, 0);
      return `Monopólio de ${RESOURCE_LABELS[event.data.resource]}: ${quem(event.actor)} recolheu ${total} carta(s).`;
    }
    case 'yearOfPlentyResolved':
      return `${quem(event.actor)} pegou ${event.data.resources.map((r) => RESOURCE_LABELS[r]).join(' + ')} do banco.`;
    case 'bankTraded':
      return `${quem(event.actor)} trocou ${event.data.rate}× ${RESOURCE_LABELS[event.data.give]} por 1× ${RESOURCE_LABELS[event.data.receive]}.`;
    case 'tradeOffered':
      return `${quem(event.actor)} propôs ${describeResources(event.data.terms.give)} por ${describeResources(event.data.terms.receive)}.`;
    case 'tradeResponded': {
      const r = event.data.response;
      const texto =
        r.type === 'accept' ? 'aceitou' : r.type === 'decline' ? 'recusou' : 'contrapropôs';
      return `${quem(event.actor)} ${texto} a proposta.`;
    }
    case 'tradeCompleted':
      return `${quem(event.actor)} fechou negócio com ${quem(event.data.partner)}.`;
    case 'longestRoadChanged':
      return event.data.owner === null
        ? `${LONGEST_ROAD_LABEL} ficou sem dono.`
        : `${LONGEST_ROAD_LABEL} (${event.data.length}) agora é de ${quem(event.data.owner)}.`;
    case 'largestArmyChanged':
      return event.data.owner === null
        ? `${LARGEST_ARMY_LABEL} ficou sem dono.`
        : `${LARGEST_ARMY_LABEL} (${event.data.size}) agora é de ${quem(event.data.owner)}.`;
    case 'turnEnded':
      return `Turno ${event.data.turnNumber}: vez de ${quem(event.data.nextPlayer)}.`;
    case 'gameWon':
      return `🏆 ${quem(event.actor)} venceu com ${event.data.victoryPoints} pontos de vitória!`;
  }
}

/**
 * O alvo específico de uma ação, para o segundo nível de escolha.
 *
 * O rótulo do *tipo* da ação está em `ACTION_LABELS`; aqui é o que distingue
 * uma opção da outra dentro do mesmo tipo — qual vértice, qual recurso, de quem
 * roubar. Ações sem alvo (rolar, encerrar) devolvem string vazia: quem chama já
 * tem o rótulo do tipo e não precisa repetir.
 */
export function describeAction(
  scope: NarrationScope,
  action: Action,
  options?: NarrationOptions,
): string {
  const quem = (id: PlayerId): string => nome(scope, id, options);
  const board = scope.board;

  switch (action.type) {
    case 'placeSettlement':
    case 'buildCity':
      return describeVertex(board, action.vertexId);
    case 'placeRoad':
      return describeEdge(board, action.edgeId);
    case 'moveRobber': {
      const alvo =
        action.stealFrom === null ? 'sem roubar ninguém' : `roubando de ${quem(action.stealFrom)}`;
      return `${describeHex(board, action.hexId)} — ${alvo}`;
    }
    case 'playYearOfPlenty':
      return action.resources.map((r) => RESOURCE_LABELS[r]).join(' + ');
    case 'playMonopoly':
      return RESOURCE_LABELS[action.resource];
    case 'tradeBank':
      return `dar ${RESOURCE_LABELS[action.give]} → receber ${RESOURCE_LABELS[action.receive]}`;
    case 'tradeOffer':
      return `ofereço ${describeResources(action.terms.give)} por ${describeResources(action.terms.receive)}`;
    case 'tradeRespond':
      return action.response.type === 'accept'
        ? 'aceitar'
        : action.response.type === 'decline'
          ? 'recusar'
          : `contrapropor ${describeResources(action.response.terms.give)} por ${describeResources(action.response.terms.receive)}`;
    case 'tradeConfirm':
      return `fechar com ${quem(action.withPlayer)}`;
    case 'discard':
      return describeResources(action.resources);
    case 'rollDice':
    case 'endTurn':
    case 'buyDevCard':
    case 'playKnight':
    case 'playRoadBuilding':
      return '';
  }
}

/**
 * Agrupa as jogadas legais por tipo, na ordem de exibição.
 *
 * É o que permite a mesma regra na CLI e na interface: grupo com uma opção só
 * dispara direto, grupo com várias abre uma escolha. Sem isto, cada cliente
 * inventa a própria lista de "o que aparece primeiro" — e a CLI e a web
 * discordam sobre onde está o botão de encerrar turno.
 */
export function groupActions(
  actions: readonly Action[],
): { type: ActionType; actions: Action[] }[] {
  const groups = new Map<ActionType, Action[]>();
  for (const action of actions) {
    const list = groups.get(action.type);
    if (list === undefined) groups.set(action.type, [action]);
    else list.push(action);
  }
  return ACTION_ORDER.filter((t) => groups.has(t)).map((type) => ({
    type,
    actions: groups.get(type) as Action[],
  }));
}

/** Ordem de exibição: o que faz a partida andar primeiro. */
export const ACTION_ORDER: readonly ActionType[] = [
  'rollDice',
  'discard',
  'moveRobber',
  'placeSettlement',
  'placeRoad',
  'buildCity',
  'buyDevCard',
  'playKnight',
  'playRoadBuilding',
  'playYearOfPlenty',
  'playMonopoly',
  'tradeBank',
  'tradeOffer',
  'tradeRespond',
  'tradeConfirm',
  'endTurn',
];
