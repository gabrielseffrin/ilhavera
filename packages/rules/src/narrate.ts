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
 * Na Fase 5 (M7) as 23 frases saíram do `switch` para `narracao/pt-BR.ts`. O
 * texto é o mesmo — os testes deste arquivo passam sem uma asserção alterada, e
 * é isso que prova que a extração não mexeu em nada. O que se ganhou é que um
 * segundo idioma passa a ser um arquivo novo em vez de uma reescrita da função,
 * e a exaustividade continua garantida: `PacoteDeNarracao` é um `Record` sobre
 * `GameEvent['type']`, então evento novo sem frase não compila.
 */

import type { BoardGraph } from './board/graph.js';
import type { GameEvent } from './state.js';
import type { Action, ActionType } from './actions/types.js';
import type { EdgeId, HexId, PlayerColor, PlayerId, ResourceCount, VertexId } from './types.js';
import { RESOURCES } from './types.js';
import { RESOURCE_LABELS, TERRAIN_LABELS, portLabel } from './labels.js';
import { NARRACAO_PT_BR } from './narracao/pt-BR.js';
import type { ContextoDeNarracao, PacoteDeNarracao } from './narracao/pt-BR.js';

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
  /**
   * O pacote de frases. Padrão: pt-BR, o único escrito (Fase 5, M7).
   *
   * É por aqui que um segundo idioma entraria — um arquivo ao lado de
   * `narracao/pt-BR.ts`, sem tocar nesta função.
   */
  narracao?: PacoteDeNarracao;
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
  const board = scope.board;
  const contexto: ContextoDeNarracao = {
    quem: (id) => nome(scope, id, options),
    vertice: (id) => describeVertex(board, id),
    aresta: (id) => describeEdge(board, id),
    hex: (id) => describeHex(board, id),
    recursos: (counts) => describeResources(counts as ResourceCount),
  };

  /**
   * A asserção existe porque `event` é a união inteira aqui, e indexar o pacote
   * com `event.type` genérico colapsa as 23 assinaturas numa só — o TypeScript
   * passa a exigir a interseção dos parâmetros. É o mesmo colapso que
   * `apps/server/src/protocol/game.ts` documenta ao registrar um handler por
   * linha, e a garantia que importa continua de pé no **pacote**: `PacoteDeNarracao`
   * é um `Record` sobre `GameEvent['type']`, então evento novo sem frase não
   * compila lá.
   */
  const frase = NARRACAO_PT_BR[event.type] as (e: GameEvent, c: ContextoDeNarracao) => string;
  const escolhido = options?.narracao?.[event.type] as
    ((e: GameEvent, c: ContextoDeNarracao) => string) | undefined;

  return (escolhido ?? frase)(event, contexto);
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
