/**
 * Ações do motor — o vocabulário fechado do que se pode tentar fazer.
 *
 * Corresponde à tabela de comandos de §5.1. Uma diferença deliberada:
 * `game:playDevCard { card, params }` vira quatro ações concretas
 * (`playKnight`, `playRoadBuilding`, `playYearOfPlenty`, `playMonopoly`).
 * Um union discriminado dá validação de tipo de verdade nos parâmetros de cada
 * carta, coisa que um `params` genérico não dá. A tradução do comando de rede
 * para a ação é trabalho do pacote `protocol`, na Fase 2.
 */

import type { EdgeId, HexId, PlayerId, Resource, ResourceCount, VertexId } from '../types.js';
import type { TradeResponse, TradeTerms } from '../state.js';

export type Action =
  // Setup e construção
  | { type: 'placeSettlement'; player: PlayerId; vertexId: VertexId }
  | { type: 'placeRoad'; player: PlayerId; edgeId: EdgeId }
  | { type: 'buildCity'; player: PlayerId; vertexId: VertexId }
  // Turno
  | { type: 'rollDice'; player: PlayerId }
  | { type: 'endTurn'; player: PlayerId }
  // Saqueador
  | { type: 'discard'; player: PlayerId; resources: ResourceCount }
  | { type: 'moveRobber'; player: PlayerId; hexId: HexId; stealFrom: PlayerId | null }
  // Cartas de Progresso
  | { type: 'buyDevCard'; player: PlayerId }
  | { type: 'playKnight'; player: PlayerId }
  | { type: 'playRoadBuilding'; player: PlayerId }
  | { type: 'playYearOfPlenty'; player: PlayerId; resources: [Resource, Resource] }
  | { type: 'playMonopoly'; player: PlayerId; resource: Resource }
  // Comércio
  | { type: 'tradeBank'; player: PlayerId; give: Resource; receive: Resource }
  | { type: 'tradeOffer'; player: PlayerId; terms: TradeTerms; targets: PlayerId[] }
  | { type: 'tradeRespond'; player: PlayerId; tradeId: string; response: TradeResponse }
  | { type: 'tradeConfirm'; player: PlayerId; tradeId: string; withPlayer: PlayerId };

export type ActionType = Action['type'];

export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;
