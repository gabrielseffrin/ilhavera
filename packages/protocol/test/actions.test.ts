/**
 * A tabela de tradução é o contrato entre o esquema zod de §5.1 e o vocabulário
 * de `Action` do motor. Boa parte dela já é garantida pelo compilador; o que
 * sobra para o teste é o que o tipo não pega: o comando entrar pelo `parseCommand`
 * e sair como a ação certa, com os campos nos lugares certos.
 */

import { describe, expect, it } from 'vitest';

import type { Action } from '@ilhavera/rules';

import {
  COMMANDS,
  GAME_COMMANDS,
  isGameCommand,
  parseCommand,
  toAction,
  type CommandName,
  type GameCommandName,
} from '../src/index.js';

const JOGADOR = 'jogador-1';

/** Percorre o caminho real: valida com zod e traduz o payload já validado. */
function traduz<K extends GameCommandName>(name: K, payload: unknown): Action {
  const parsed = parseCommand(name, payload);
  if (!parsed.success) throw new Error(`payload inválido para ${name}: ${parsed.error.message}`);
  return toAction(name, parsed.data, JOGADOR);
}

const VAZIO = { requestId: 'r1' };

describe('toAction: comandos com correspondência direta', () => {
  const casos: [GameCommandName, unknown, Action][] = [
    [
      'game:placeSettlement',
      { ...VAZIO, vertexId: 'v1' },
      { type: 'placeSettlement', player: JOGADOR, vertexId: 'v1' },
    ],
    [
      'game:placeRoad',
      { ...VAZIO, edgeId: 'e1' },
      { type: 'placeRoad', player: JOGADOR, edgeId: 'e1' },
    ],
    [
      'game:buildCity',
      { ...VAZIO, vertexId: 'v2' },
      { type: 'buildCity', player: JOGADOR, vertexId: 'v2' },
    ],
    ['game:rollDice', VAZIO, { type: 'rollDice', player: JOGADOR }],
    ['game:buyDevCard', VAZIO, { type: 'buyDevCard', player: JOGADOR }],
    ['game:endTurn', VAZIO, { type: 'endTurn', player: JOGADOR }],
    [
      'game:discard',
      { ...VAZIO, resources: { lumber: 1, brick: 0, wool: 2, grain: 0, ore: 0 } },
      {
        type: 'discard',
        player: JOGADOR,
        resources: { lumber: 1, brick: 0, wool: 2, grain: 0, ore: 0 },
      },
    ],
    [
      'game:tradeBank',
      { ...VAZIO, give: 'ore', receive: 'wool' },
      { type: 'tradeBank', player: JOGADOR, give: 'ore', receive: 'wool' },
    ],
    [
      'game:tradeRespond',
      { ...VAZIO, tradeId: 't1', response: { type: 'decline' } },
      { type: 'tradeRespond', player: JOGADOR, tradeId: 't1', response: { type: 'decline' } },
    ],
  ];

  it.each(casos)('%s vira a ação correspondente', (name, payload, esperada) => {
    expect(traduz(name, payload)).toEqual(esperada);
  });

  it('game:tradeOffer carrega termos e alvos', () => {
    const terms = {
      give: { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 },
      receive: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 1 },
    };
    expect(traduz('game:tradeOffer', { ...VAZIO, terms, targets: ['b', 'c'] })).toEqual({
      type: 'tradeOffer',
      player: JOGADOR,
      terms,
      targets: ['b', 'c'],
    });
  });

  it('game:moveRobber preserva stealFrom nulo — não roubar é uma escolha válida', () => {
    expect(traduz('game:moveRobber', { ...VAZIO, hexId: 'h1', stealFrom: null })).toEqual({
      type: 'moveRobber',
      player: JOGADOR,
      hexId: 'h1',
      stealFrom: null,
    });
    expect(traduz('game:moveRobber', { ...VAZIO, hexId: 'h1', stealFrom: 'b' })).toEqual({
      type: 'moveRobber',
      player: JOGADOR,
      hexId: 'h1',
      stealFrom: 'b',
    });
  });
});

describe('toAction: as duas costuras de verdade', () => {
  it('game:playDevCard vira quatro ações distintas', () => {
    expect(traduz('game:playDevCard', { ...VAZIO, card: 'knight' })).toEqual({
      type: 'playKnight',
      player: JOGADOR,
    });
    expect(traduz('game:playDevCard', { ...VAZIO, card: 'roadBuilding' })).toEqual({
      type: 'playRoadBuilding',
      player: JOGADOR,
    });
    expect(
      traduz('game:playDevCard', { ...VAZIO, card: 'yearOfPlenty', resources: ['ore', 'wool'] }),
    ).toEqual({ type: 'playYearOfPlenty', player: JOGADOR, resources: ['ore', 'wool'] });
    expect(traduz('game:playDevCard', { ...VAZIO, card: 'monopoly', resource: 'grain' })).toEqual({
      type: 'playMonopoly',
      player: JOGADOR,
      resource: 'grain',
    });
  });

  it('game:tradeConfirm renomeia withPlayerId para withPlayer', () => {
    const acao = traduz('game:tradeConfirm', { ...VAZIO, tradeId: 't1', withPlayerId: 'bruno' });
    expect(acao).toEqual({
      type: 'tradeConfirm',
      player: JOGADOR,
      tradeId: 't1',
      withPlayer: 'bruno',
    });
    expect(acao).not.toHaveProperty('withPlayerId');
  });
});

describe('cobertura da tabela', () => {
  it('traduz exatamente os comandos game:* declarados em COMMANDS', () => {
    const declarados = (Object.keys(COMMANDS) as CommandName[]).filter((n) =>
      n.startsWith('game:'),
    );
    expect([...GAME_COMMANDS].sort()).toEqual([...declarados].sort());
  });

  it('isGameCommand separa as três famílias de comando', () => {
    expect(isGameCommand('game:rollDice')).toBe(true);
    expect(isGameCommand('room:create')).toBe(false);
    expect(isGameCommand('chat:send')).toBe(false);
  });

  it('toda ação traduzida leva o jogador que enviou o comando', () => {
    for (const name of GAME_COMMANDS) {
      const payload = PAYLOAD_MINIMO[name];
      expect(traduz(name, { ...VAZIO, ...payload }).player).toBe(JOGADOR);
    }
  });
});

/** Um payload válido por comando, para varrer a tabela inteira. */
const PAYLOAD_MINIMO: Record<GameCommandName, Record<string, unknown>> = {
  'game:placeSettlement': { vertexId: 'v1' },
  'game:placeRoad': { edgeId: 'e1' },
  'game:buildCity': { vertexId: 'v1' },
  'game:rollDice': {},
  'game:discard': { resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 } },
  'game:moveRobber': { hexId: 'h1', stealFrom: null },
  'game:buyDevCard': {},
  'game:playDevCard': { card: 'knight' },
  'game:tradeBank': { give: 'ore', receive: 'wool' },
  'game:tradeOffer': {
    terms: {
      give: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 1 },
      receive: { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 },
    },
    targets: ['b'],
  },
  'game:tradeRespond': { tradeId: 't1', response: { type: 'accept' } },
  'game:tradeConfirm': { tradeId: 't1', withPlayerId: 'b' },
  'game:endTurn': {},
};
