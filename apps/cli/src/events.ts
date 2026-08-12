/**
 * Eventos do motor em português, para o log da partida.
 */

import {
  DEV_CARD_LABELS,
  RESOURCE_LABELS,
  ROBBER_LABEL,
  LONGEST_ROAD_LABEL,
  LARGEST_ARMY_LABEL,
  type GameEvent,
  type GameState,
} from '@ilhavera/rules';

import {
  describeEdge,
  describeHex,
  describeResources,
  describeVertex,
  playerTag,
} from './render.js';

export function describeEvent(state: GameState, event: GameEvent): string {
  switch (event.type) {
    case 'gameStarted':
      return `Partida iniciada (semente ${event.data.seed}).`;
    case 'settlementPlaced':
      return `${playerTag(state, event.actor)} colocou um assentamento em ${describeVertex(state, event.data.vertexId)}.`;
    case 'roadPlaced':
      return `${playerTag(state, event.actor)} colocou uma estrada ${describeEdge(state, event.data.edgeId)}${event.data.free ? ' (grátis)' : ''}.`;
    case 'cityBuilt':
      return `${playerTag(state, event.actor)} construiu uma cidade em ${describeVertex(state, event.data.vertexId)}.`;
    case 'diceRolled':
      return `${playerTag(state, event.actor)} rolou ${event.data.dice[0]} + ${event.data.dice[1]} = ${event.data.total}.`;
    case 'resourcesProduced': {
      const ganhos = Object.entries(event.data.gains)
        .map(([id, counts]) => `${playerTag(state, id)}: ${describeResources(counts)}`)
        .join(' | ');
      const bloqueados =
        event.data.blockedByBank.length === 0
          ? ''
          : ` (banco sem estoque: ${event.data.blockedByBank.map((r) => RESOURCE_LABELS[r]).join(', ')})`;
      return `Produção — ${ganhos === '' ? 'ninguém produziu' : ganhos}${bloqueados}`;
    }
    case 'setupProduction':
      return `${playerTag(state, event.actor)} recebeu ${describeResources(event.data.gains)} pelo segundo assentamento.`;
    case 'discardRequired': {
      const alvos = Object.entries(event.data.counts)
        .map(([id, n]) => `${playerTag(state, id)} (${n})`)
        .join(', ');
      return `Saiu 7 — descarte obrigatório: ${alvos}.`;
    }
    case 'discarded':
      return `${playerTag(state, event.actor)} descartou ${describeResources(event.data.resources)}.`;
    case 'robberMoved':
      return `${playerTag(state, event.actor)} moveu o ${ROBBER_LABEL} para ${describeHex(state, event.data.hexId)}.`;
    case 'stolen': {
      const carta =
        event.data.resource === null ? 'uma carta' : `1× ${RESOURCE_LABELS[event.data.resource]}`;
      return `${playerTag(state, event.actor)} roubou ${carta} de ${playerTag(state, event.data.from)}.`;
    }
    case 'devCardBought':
      return `${playerTag(state, event.actor)} comprou uma Carta de Progresso (restam ${event.data.deckLeft}).`;
    case 'devCardPlayed':
      return `${playerTag(state, event.actor)} jogou ${DEV_CARD_LABELS[event.data.card]}.`;
    case 'monopolyResolved': {
      const total = Object.values(event.data.taken).reduce((a, b) => a + b, 0);
      return `Monopólio de ${RESOURCE_LABELS[event.data.resource]}: ${playerTag(state, event.actor)} recolheu ${total} carta(s).`;
    }
    case 'yearOfPlentyResolved':
      return `${playerTag(state, event.actor)} pegou ${event.data.resources.map((r) => RESOURCE_LABELS[r]).join(' + ')} do banco.`;
    case 'bankTraded':
      return `${playerTag(state, event.actor)} trocou ${event.data.rate}× ${RESOURCE_LABELS[event.data.give]} por 1× ${RESOURCE_LABELS[event.data.receive]}.`;
    case 'tradeOffered':
      return `${playerTag(state, event.actor)} propôs ${describeResources(event.data.terms.give)} por ${describeResources(event.data.terms.receive)}.`;
    case 'tradeResponded': {
      const r = event.data.response;
      const texto =
        r.type === 'accept' ? 'aceitou' : r.type === 'decline' ? 'recusou' : 'contrapropôs';
      return `${playerTag(state, event.actor)} ${texto} a proposta.`;
    }
    case 'tradeCompleted':
      return `${playerTag(state, event.actor)} fechou negócio com ${playerTag(state, event.data.partner)}.`;
    case 'longestRoadChanged':
      return event.data.owner === null
        ? `${LONGEST_ROAD_LABEL} ficou sem dono.`
        : `${LONGEST_ROAD_LABEL} (${event.data.length}) agora é de ${playerTag(state, event.data.owner)}.`;
    case 'largestArmyChanged':
      return event.data.owner === null
        ? `${LARGEST_ARMY_LABEL} ficou sem dono.`
        : `${LARGEST_ARMY_LABEL} (${event.data.size}) agora é de ${playerTag(state, event.data.owner)}.`;
    case 'turnEnded':
      return `Turno ${event.data.turnNumber}: vez de ${playerTag(state, event.data.nextPlayer)}.`;
    case 'gameWon':
      return `🏆 ${playerTag(state, event.actor)} venceu com ${event.data.victoryPoints} pontos de vitória!`;
  }
}
