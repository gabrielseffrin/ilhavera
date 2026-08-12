/**
 * Tradução de ações do motor para texto de menu.
 *
 * O menu é montado a partir de `enumerateLegalActions`, então é impossível
 * escolher uma jogada ilegal por engano. Qualquer rejeição que ainda apareça
 * na CLI é bug de regra de verdade — que é exatamente o valor de ter a CLI na
 * Fase 1.
 */

import {
  DEV_CARD_LABELS,
  RESOURCE_LABELS,
  type Action,
  type ActionType,
  type GameState,
} from '@ilhavera/rules';

import {
  describeEdge,
  describeHex,
  describeResources,
  describeVertex,
  playerTag,
} from './render.js';

export const ACTION_GROUP_LABELS: Record<ActionType, string> = {
  placeSettlement: 'Colocar assentamento',
  placeRoad: 'Colocar estrada',
  buildCity: 'Construir cidade',
  rollDice: 'Rolar os dados',
  endTurn: 'Encerrar o turno',
  discard: 'Descartar cartas',
  moveRobber: 'Mover o Saqueador',
  buyDevCard: 'Comprar Carta de Progresso',
  playKnight: `Jogar ${DEV_CARD_LABELS.knight}`,
  playRoadBuilding: `Jogar ${DEV_CARD_LABELS.roadBuilding}`,
  playYearOfPlenty: `Jogar ${DEV_CARD_LABELS.yearOfPlenty}`,
  playMonopoly: `Jogar ${DEV_CARD_LABELS.monopoly}`,
  tradeBank: 'Comerciar com o banco/porto',
  tradeOffer: 'Propor troca a jogadores',
  tradeRespond: 'Responder à proposta',
  tradeConfirm: 'Consumar a troca',
};

/** Ordem de exibição: o que faz a partida andar primeiro. */
const GROUP_ORDER: ActionType[] = [
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

export function groupActions(actions: Action[]): { type: ActionType; actions: Action[] }[] {
  const groups = new Map<ActionType, Action[]>();
  for (const action of actions) {
    const list = groups.get(action.type);
    if (list === undefined) groups.set(action.type, [action]);
    else list.push(action);
  }
  return GROUP_ORDER.filter((t) => groups.has(t)).map((type) => ({
    type,
    actions: groups.get(type) as Action[],
  }));
}

/** Descrição do alvo específico de uma ação, para o segundo nível do menu. */
export function describeAction(state: GameState, action: Action): string {
  switch (action.type) {
    case 'placeSettlement':
      return describeVertex(state, action.vertexId);
    case 'placeRoad':
      return describeEdge(state, action.edgeId);
    case 'buildCity':
      return describeVertex(state, action.vertexId);
    case 'moveRobber': {
      const alvo =
        action.stealFrom === null
          ? 'sem roubar ninguém'
          : `roubando de ${playerTag(state, action.stealFrom)}`;
      return `${describeHex(state, action.hexId)} — ${alvo}`;
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
      return `fechar com ${playerTag(state, action.withPlayer)}`;
    case 'discard':
      return describeResources(action.resources);
    default:
      return '';
  }
}
