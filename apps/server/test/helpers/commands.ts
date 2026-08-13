/**
 * O caminho inverso de `TO_ACTION`: da ação do motor para o comando de rede.
 *
 * Só os testes precisam disto. O servidor traduz numa direção só — comando vira
 * ação —, e é o cliente quem decide o que mandar. Aqui o "cliente" é um teste
 * que escolhe jogadas com `enumerateLegalActions`, então precisa do caminho de
 * volta para falar com o servidor.
 *
 * Cobre os treze comandos `game:*`. Se o motor ganhar uma ação nova sem comando
 * correspondente, o `switch` exaustivo para de compilar aqui.
 */

import type { Action } from '@ilhavera/rules';
import type { CommandName } from '@ilhavera/protocol';

export type ComandoDeRede = { nome: CommandName; payload: Record<string, unknown> };

export function comandoDaAcao(acao: Action): ComandoDeRede {
  switch (acao.type) {
    case 'placeSettlement':
      return { nome: 'game:placeSettlement', payload: { vertexId: acao.vertexId } };
    case 'placeRoad':
      return { nome: 'game:placeRoad', payload: { edgeId: acao.edgeId } };
    case 'buildCity':
      return { nome: 'game:buildCity', payload: { vertexId: acao.vertexId } };
    case 'rollDice':
      return { nome: 'game:rollDice', payload: {} };
    case 'endTurn':
      return { nome: 'game:endTurn', payload: {} };
    case 'discard':
      return { nome: 'game:discard', payload: { resources: acao.resources } };
    case 'moveRobber':
      return {
        nome: 'game:moveRobber',
        payload: { hexId: acao.hexId, stealFrom: acao.stealFrom },
      };
    case 'buyDevCard':
      return { nome: 'game:buyDevCard', payload: {} };

    // As quatro cartas voltam a ser um comando só, com o discriminante.
    case 'playKnight':
      return { nome: 'game:playDevCard', payload: { card: 'knight' } };
    case 'playRoadBuilding':
      return { nome: 'game:playDevCard', payload: { card: 'roadBuilding' } };
    case 'playYearOfPlenty':
      return {
        nome: 'game:playDevCard',
        payload: { card: 'yearOfPlenty', resources: acao.resources },
      };
    case 'playMonopoly':
      return { nome: 'game:playDevCard', payload: { card: 'monopoly', resource: acao.resource } };

    case 'tradeBank':
      return { nome: 'game:tradeBank', payload: { give: acao.give, receive: acao.receive } };
    case 'tradeOffer':
      return { nome: 'game:tradeOffer', payload: { terms: acao.terms, targets: acao.targets } };
    case 'tradeRespond':
      return {
        nome: 'game:tradeRespond',
        payload: { tradeId: acao.tradeId, response: acao.response },
      };
    // O renome que o `protocol` desfaz do outro lado.
    case 'tradeConfirm':
      return {
        nome: 'game:tradeConfirm',
        payload: { tradeId: acao.tradeId, withPlayerId: acao.withPlayer },
      };
  }
}
