/**
 * Rótulos em pt-BR — a terminologia própria exigida por §2 do roadmap.
 *
 * Ficam separados dos identificadores de propósito: a Fase 5 prevê i18n
 * (pt-BR no MVP, estrutura pronta para en), e trocar de idioma não pode
 * significar renomear o domínio inteiro.
 */

import type { DevCard, PortType, Resource, Terrain } from './types.js';
import type { ErrorCode } from './errors.js';
import type { Phase } from './state.js';
import type { ActionType } from './actions/types.js';

export const RESOURCE_LABELS: Readonly<Record<Resource, string>> = {
  lumber: 'Madeira',
  brick: 'Tijolo',
  wool: 'Lã',
  grain: 'Trigo',
  ore: 'Minério',
};

export const TERRAIN_LABELS: Readonly<Record<Terrain, string>> = {
  forest: 'Floresta',
  hill: 'Colina',
  pasture: 'Pasto',
  field: 'Campo',
  mountain: 'Montanha',
  desert: 'Deserto',
};

export const DEV_CARD_LABELS: Readonly<Record<DevCard, string>> = {
  knight: 'Soldado',
  victoryPoint: 'Ponto de Vitória',
  roadBuilding: 'Construção de Estradas',
  yearOfPlenty: 'Descoberta',
  monopoly: 'Monopólio',
};

export function portLabel(port: PortType): string {
  return port === 'generic' ? 'Porto 3:1' : `Porto 2:1 ${RESOURCE_LABELS[port]}`;
}

/** O "Ladrão" do jogo clássico; aqui, Saqueador (§2). */
export const PHASE_LABELS: Readonly<Record<Phase, string>> = {
  lobby: 'Aguardando jogadores',
  setup1: 'Preparação — 1ª rodada',
  setup2: 'Preparação — 2ª rodada',
  awaitingRoll: 'Aguardando rolagem',
  discarding: 'Descarte',
  movingRobber: 'Movendo o Saqueador',
  main: 'Fase principal',
  finished: 'Partida encerrada',
};

/**
 * O motivo da recusa, em português, para a interface poder explicar em vez de
 * só piscar em vermelho.
 *
 * `Record<ErrorCode, string>` e não um mapa parcial: código de erro novo sem
 * rótulo não compila, que é a única forma de isto não apodrecer.
 */
export const ERROR_LABELS: Readonly<Record<ErrorCode, string>> = {
  NOT_YOUR_TURN: 'Não é a sua vez.',
  INVALID_PHASE: 'Esta jogada não cabe neste momento do turno.',
  UNKNOWN_PLAYER: 'Jogador não está nesta partida.',
  GAME_FINISHED: 'A partida já terminou.',
  INSUFFICIENT_RESOURCES: 'Recursos insuficientes.',
  DISTANCE_RULE_VIOLATION: 'Há um assentamento vizinho demais deste ponto.',
  VERTEX_OCCUPIED: 'Já existe construção neste ponto.',
  VERTEX_NOT_FOUND: 'Ponto inexistente no tabuleiro.',
  EDGE_NOT_FOUND: 'Caminho inexistente no tabuleiro.',
  EDGE_OCCUPIED: 'Já existe estrada neste caminho.',
  HEX_NOT_FOUND: 'Hexágono inexistente no tabuleiro.',
  ROAD_NOT_CONNECTED: 'A estrada precisa encostar em algo seu.',
  SETTLEMENT_NOT_CONNECTED: 'O assentamento precisa encostar numa estrada sua.',
  NO_PIECES_LEFT: 'Acabaram as peças deste tipo.',
  NOT_YOUR_SETTLEMENT: 'Este assentamento não é seu.',
  ALREADY_CITY: 'Aqui já é uma cidade.',
  DEV_CARD_ALREADY_PLAYED: 'Você já jogou uma Carta de Progresso neste turno.',
  DEV_CARD_BOUGHT_THIS_TURN: 'Esta carta foi comprada neste turno.',
  DEV_CARD_NOT_OWNED: 'Você não tem esta carta.',
  DEV_CARD_NOT_PLAYABLE: 'Esta carta não pode ser jogada.',
  DEV_DECK_EMPTY: 'O baralho de Cartas de Progresso acabou.',
  ROBBER_SAME_HEX: 'O Saqueador precisa mudar de hexágono.',
  INVALID_STEAL_TARGET: 'Não dá para roubar deste jogador.',
  BANK_DEPLETED: 'O banco não tem este recurso.',
  INVALID_DISCARD: 'Descarte inválido.',
  NOTHING_TO_DISCARD: 'Você não precisa descartar.',
  INVALID_TRADE: 'Troca inválida.',
  TRADE_EXPIRED: 'Esta proposta não está mais valendo.',
  TRADE_NOT_ACCEPTED: 'Este jogador não aceitou a proposta.',
  INVALID_ACTION: 'Jogada inválida.',
};

/**
 * O que cada jogada oferece, do ponto de vista de quem vai clicar.
 *
 * `Record<ActionType, string>` pela mesma razão de `ERROR_LABELS`: ação nova no
 * motor sem rótulo não compila. Vive aqui, e não em cada cliente, porque a CLI
 * e a interface precisam chamar a mesma jogada pelo mesmo nome — senão duas
 * pessoas descrevem o mesmo bug com palavras diferentes.
 */
export const ACTION_LABELS: Readonly<Record<ActionType, string>> = {
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

export const ROBBER_LABEL = 'Saqueador';
export const LONGEST_ROAD_LABEL = 'Estrada Mais Longa';
export const LARGEST_ARMY_LABEL = 'Maior Exército';
