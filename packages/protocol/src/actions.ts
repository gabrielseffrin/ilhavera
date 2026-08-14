/**
 * Tradução de comando de rede para ação do motor — a costura entre §5.1 e o
 * vocabulário de `Action`.
 *
 * Mora aqui, e não no servidor, porque o cliente da Fase 3 roda o mesmo motor
 * como *preview* (§6.1) e precisa da mesma tradução: no servidor ela ficaria
 * inalcançável, e duas cópias divergem. É também o motivo de o import de
 * `@ilhavera/rules` ser `import type` — a tabela é só literais de objeto, e um
 * import de valor arrastaria o motor inteiro para o bundle do navegador.
 *
 * O payload chega **já validado** por `parseCommand`. Não há validação aqui:
 * dois pontos de validação é como se passa a validar em nenhum.
 */

import type { Action, PlayerId } from '@ilhavera/rules';

import type { CommandName, CommandPayload } from './index.js';

/** Os comandos que viram ação do motor. `room:*` e `chat:*` não passam por aqui. */
export type GameCommandName = Extract<CommandName, `game:${string}`>;

/**
 * Um construtor por comando. O tipo mapeado dá a cada entrada o payload exato
 * daquele comando, então divergência entre o esquema zod e a `Action` vira erro
 * de compilação neste arquivo — que é onde se quer o estrago.
 */
export const TO_ACTION: {
  readonly [K in GameCommandName]: (payload: CommandPayload<K>, player: PlayerId) => Action;
} = {
  'game:placeSettlement': (p, player) => ({
    type: 'placeSettlement',
    player,
    vertexId: p.vertexId,
  }),
  'game:placeRoad': (p, player) => ({ type: 'placeRoad', player, edgeId: p.edgeId }),
  'game:buildCity': (p, player) => ({ type: 'buildCity', player, vertexId: p.vertexId }),
  'game:rollDice': (_p, player) => ({ type: 'rollDice', player }),
  'game:discard': (p, player) => ({ type: 'discard', player, resources: p.resources }),
  'game:moveRobber': (p, player) => ({
    type: 'moveRobber',
    player,
    hexId: p.hexId,
    stealFrom: p.stealFrom,
  }),
  'game:buyDevCard': (_p, player) => ({ type: 'buyDevCard', player }),

  /**
   * O único 1→N: um comando de rede vira quatro ações concretas. O motor
   * escolheu assim de propósito (ver `actions/types.ts`) — um `params` genérico
   * não validaria os parâmetros de cada carta.
   */
  'game:playDevCard': (p, player) => {
    switch (p.card) {
      case 'knight':
        return { type: 'playKnight', player };
      case 'roadBuilding':
        return { type: 'playRoadBuilding', player };
      case 'yearOfPlenty':
        return { type: 'playYearOfPlenty', player, resources: p.resources };
      case 'monopoly':
        return { type: 'playMonopoly', player, resource: p.resource };
    }
  },

  'game:tradeBank': (p, player) => ({
    type: 'tradeBank',
    player,
    give: p.give,
    receive: p.receive,
  }),
  'game:tradeOffer': (p, player) => ({
    type: 'tradeOffer',
    player,
    terms: p.terms,
    targets: p.targets,
  }),
  'game:tradeRespond': (p, player) => ({
    type: 'tradeRespond',
    player,
    tradeId: p.tradeId,
    response: p.response,
  }),
  // A rede diz `withPlayerId`; o motor diz `withPlayer`. A divergência morre aqui.
  'game:tradeConfirm': (p, player) => ({
    type: 'tradeConfirm',
    player,
    tradeId: p.tradeId,
    withPlayer: p.withPlayerId,
  }),
  'game:endTurn': (_p, player) => ({ type: 'endTurn', player }),
};

/**
 * Só para testes e diagnóstico. **Não** use para registrar handlers num laço:
 * o `K` genérico colapsa na união e o payload deixa de ser o do comando (ver o
 * comentário em `apps/server/src/protocol/game.ts`).
 */
export const GAME_COMMANDS = Object.keys(TO_ACTION) as GameCommandName[];

export function isGameCommand(name: CommandName): name is GameCommandName {
  return name.startsWith('game:');
}

export function toAction<K extends GameCommandName>(
  name: K,
  payload: CommandPayload<K>,
  player: PlayerId,
): Action {
  return TO_ACTION[name](payload, player);
}

/**
 * Um comando pronto para o fio: o nome e o payload que casa com ele.
 *
 * União discriminada, e não `{ nome, payload: Record<string, unknown> }`, porque
 * é assim que `socket.emit(cmd.name, ...)` continua checado — com o payload
 * frouxo, um campo errado só apareceria como `BAD_PAYLOAD` em tempo de execução,
 * do outro lado da rede.
 */
export type NetworkCommand = {
  [K in GameCommandName]: { name: K; payload: CommandPayload<K> };
}[GameCommandName];

/**
 * O caminho inverso de `TO_ACTION`: da ação do motor para o comando de rede.
 *
 * O cliente enumera jogadas como `Action` — é o vocabulário que o tabuleiro, a
 * barra e os modais falam desde a Fase 3, e é o que o servidor manda na lista de
 * legais. Mandar uma delas pelo fio é traduzir aqui. Mora junto de `TO_ACTION`
 * para que as duas direções sejam lidas lado a lado: quando o `switch` exaustivo
 * quebra por uma ação nova, a tabela que falta preencher está logo acima.
 *
 * `player` não vai no payload de propósito: quem envia é o dono do socket, e
 * aceitar o remetente pelo payload seria deixar qualquer um jogar pelos outros.
 */
export function toCommand(action: Action): NetworkCommand {
  switch (action.type) {
    case 'placeSettlement':
      return { name: 'game:placeSettlement', payload: { vertexId: action.vertexId } };
    case 'placeRoad':
      return { name: 'game:placeRoad', payload: { edgeId: action.edgeId } };
    case 'buildCity':
      return { name: 'game:buildCity', payload: { vertexId: action.vertexId } };
    case 'rollDice':
      return { name: 'game:rollDice', payload: {} };
    case 'endTurn':
      return { name: 'game:endTurn', payload: {} };
    case 'discard':
      return { name: 'game:discard', payload: { resources: action.resources } };
    case 'moveRobber':
      return {
        name: 'game:moveRobber',
        payload: { hexId: action.hexId, stealFrom: action.stealFrom },
      };
    case 'buyDevCard':
      return { name: 'game:buyDevCard', payload: {} };

    // As quatro cartas voltam a ser um comando só, com o discriminante.
    case 'playKnight':
      return { name: 'game:playDevCard', payload: { card: 'knight' } };
    case 'playRoadBuilding':
      return { name: 'game:playDevCard', payload: { card: 'roadBuilding' } };
    case 'playYearOfPlenty':
      return {
        name: 'game:playDevCard',
        payload: { card: 'yearOfPlenty', resources: action.resources },
      };
    case 'playMonopoly':
      return { name: 'game:playDevCard', payload: { card: 'monopoly', resource: action.resource } };

    case 'tradeBank':
      return { name: 'game:tradeBank', payload: { give: action.give, receive: action.receive } };
    case 'tradeOffer':
      return {
        name: 'game:tradeOffer',
        payload: { terms: action.terms, targets: action.targets },
      };
    case 'tradeRespond':
      return {
        name: 'game:tradeRespond',
        payload: { tradeId: action.tradeId, response: action.response },
      };
    // O renome que `TO_ACTION` desfaz do outro lado.
    case 'tradeConfirm':
      return {
        name: 'game:tradeConfirm',
        payload: { tradeId: action.tradeId, withPlayerId: action.withPlayer },
      };
  }
}
