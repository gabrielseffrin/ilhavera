/**
 * Comércio — §3.3 (banco e portos) e §3.5 (entre jogadores).
 */
import { describe, expect, it } from 'vitest';

import { emptyResourceCount, type ResourceCount } from '../src/types.js';
import { bankTradeRate, playerPorts } from '../src/query.js';
import {
  apply,
  clearHand,
  completeSetup,
  expectError,
  grant,
  newGame,
  patch,
} from './helpers/setup.js';
import { placeBuilding } from './helpers/board.js';
import type { GameState } from '../src/state.js';

function faseMain(): GameState {
  let s = completeSetup(newGame());
  s = patch(s, (draft) => {
    draft.phase = 'main';
  });
  for (const p of s.players) s = clearHand(s, p.id);
  return s;
}

function conta(partial: Partial<ResourceCount>): ResourceCount {
  return { ...emptyResourceCount(), ...partial };
}

/** Um vértice de porto do tipo pedido, livre. */
function vertexComPorto(s: GameState, tipo: 'generic' | 'ore'): string {
  const hit = s.board.vertexOrder.find(
    (v) => s.board.vertices[v]!.port === tipo && s.buildings[v] === undefined,
  );
  if (hit === undefined) throw new Error(`não achei porto ${tipo} livre`);
  return hit;
}

describe('comércio com o banco', () => {
  it('usa 4:1 sem porto', () => {
    let s = grant(faseMain(), 'ana', { lumber: 4 });
    expect(bankTradeRate(s, 'ana', 'lumber')).toBe(4);

    s = apply(s, { type: 'tradeBank', player: 'ana', give: 'lumber', receive: 'ore' });
    const ana = s.players.find((p) => p.id === 'ana')!;
    expect(ana.resources.lumber).toBe(0);
    expect(ana.resources.ore).toBe(1);
  });

  it('usa 3:1 com porto genérico', () => {
    let s = faseMain();
    s = placeBuilding(s, 'ana', vertexComPorto(s, 'generic'), 'settlement');
    s = grant(s, 'ana', { lumber: 3 });

    expect(playerPorts(s, 'ana')).toContain('generic');
    expect(bankTradeRate(s, 'ana', 'lumber')).toBe(3);

    s = apply(s, { type: 'tradeBank', player: 'ana', give: 'lumber', receive: 'wool' });
    expect(s.players.find((p) => p.id === 'ana')!.resources.lumber).toBe(0);
  });

  it('usa 2:1 com porto específico, e 3:1 para os demais recursos', () => {
    let s = faseMain();
    s = placeBuilding(s, 'ana', vertexComPorto(s, 'ore'), 'settlement');
    s = placeBuilding(s, 'ana', vertexComPorto(s, 'generic'), 'settlement');
    s = grant(s, 'ana', { ore: 2, lumber: 3 });

    expect(bankTradeRate(s, 'ana', 'ore')).toBe(2);
    expect(bankTradeRate(s, 'ana', 'lumber')).toBe(3);

    s = apply(s, { type: 'tradeBank', player: 'ana', give: 'ore', receive: 'grain' });
    expect(s.players.find((p) => p.id === 'ana')!.resources.ore).toBe(0);
    expect(s.players.find((p) => p.id === 'ana')!.resources.grain).toBe(1);
  });

  it('recusa quando falta 1 carta para a taxa', () => {
    const s = grant(faseMain(), 'ana', { lumber: 3 });
    expectError(
      s,
      { type: 'tradeBank', player: 'ana', give: 'lumber', receive: 'ore' },
      'INSUFFICIENT_RESOURCES',
    );
  });

  it('recusa trocar um recurso por ele mesmo', () => {
    const s = grant(faseMain(), 'ana', { lumber: 8 });
    expectError(
      s,
      { type: 'tradeBank', player: 'ana', give: 'lumber', receive: 'lumber' },
      'INVALID_TRADE',
    );
  });

  it('recusa quando o banco não tem o recurso pedido', () => {
    let s = grant(faseMain(), 'ana', { lumber: 4 });
    s = patch(s, (draft) => {
      draft.players.find((p) => p.id === 'bruno')!.resources.ore += draft.bank.ore;
      draft.bank.ore = 0;
    });
    expectError(
      s,
      { type: 'tradeBank', player: 'ana', give: 'lumber', receive: 'ore' },
      'BANK_DEPLETED',
    );
  });

  it('conserva o total de cartas', () => {
    let s = grant(faseMain(), 'ana', { lumber: 4 });
    s = apply(s, { type: 'tradeBank', player: 'ana', give: 'lumber', receive: 'ore' });
    const nasMaos = s.players.reduce(
      (sum, p) => sum + Object.values(p.resources).reduce((a, b) => a + b, 0),
      0,
    );
    const noBanco = Object.values(s.bank).reduce((a, b) => a + b, 0);
    expect(nasMaos + noBanco).toBe(95);
  });
});

describe('comércio entre jogadores', () => {
  function comProposta(): GameState {
    let s = faseMain();
    s = grant(s, 'ana', { lumber: 2 });
    s = grant(s, 'bruno', { ore: 2 });
    return apply(s, {
      type: 'tradeOffer',
      player: 'ana',
      terms: { give: conta({ lumber: 1 }), receive: conta({ ore: 1 }) },
      targets: ['bruno', 'carla'],
    });
  }

  it('só o jogador da vez inicia proposta', () => {
    const s = grant(faseMain(), 'bruno', { lumber: 2 });
    expectError(
      s,
      {
        type: 'tradeOffer',
        player: 'bruno',
        terms: { give: conta({ lumber: 1 }), receive: conta({ ore: 1 }) },
        targets: ['ana'],
      },
      'NOT_YOUR_TURN',
    );
  });

  it('registra a proposta com um id derivado do estado', () => {
    const s = comProposta();
    expect(s.activeTrade).not.toBeNull();
    expect(s.activeTrade!.proposer).toBe('ana');
    expect(s.activeTrade!.targets).toEqual(['bruno', 'carla']);
    expect(s.activeTrade!.id).toMatch(/^t\d+-\d+$/);
  });

  it('recusa proposta sem os recursos oferecidos', () => {
    const s = faseMain();
    expectError(
      s,
      {
        type: 'tradeOffer',
        player: 'ana',
        terms: { give: conta({ lumber: 1 }), receive: conta({ ore: 1 }) },
        targets: ['bruno'],
      },
      'INSUFFICIENT_RESOURCES',
    );
  });

  it('recusa proposta vazia de um dos lados', () => {
    const s = grant(faseMain(), 'ana', { lumber: 2 });
    expectError(
      s,
      {
        type: 'tradeOffer',
        player: 'ana',
        terms: { give: conta({ lumber: 1 }), receive: conta({}) },
        targets: ['bruno'],
      },
      'INVALID_TRADE',
    );
  });

  it('recusa proposta para si mesmo, duplicada ou sem destinatário', () => {
    const s = grant(faseMain(), 'ana', { lumber: 2 });
    const termos = { give: conta({ lumber: 1 }), receive: conta({ ore: 1 }) };
    expectError(
      s,
      { type: 'tradeOffer', player: 'ana', terms: termos, targets: ['ana'] },
      'INVALID_TRADE',
    );
    expectError(
      s,
      { type: 'tradeOffer', player: 'ana', terms: termos, targets: ['bruno', 'bruno'] },
      'INVALID_TRADE',
    );
    expectError(
      s,
      { type: 'tradeOffer', player: 'ana', terms: termos, targets: [] },
      'INVALID_TRADE',
    );
  });

  it('deixa o destinatário aceitar e o proponente consumar', () => {
    let s = comProposta();
    const tradeId = s.activeTrade!.id;

    s = apply(s, {
      type: 'tradeRespond',
      player: 'bruno',
      tradeId,
      response: { type: 'accept' },
    });
    s = apply(s, { type: 'tradeConfirm', player: 'ana', tradeId, withPlayer: 'bruno' });

    expect(s.players.find((p) => p.id === 'ana')!.resources.ore).toBe(1);
    expect(s.players.find((p) => p.id === 'ana')!.resources.lumber).toBe(1);
    expect(s.players.find((p) => p.id === 'bruno')!.resources.lumber).toBe(1);
    expect(s.players.find((p) => p.id === 'bruno')!.resources.ore).toBe(1);
    expect(s.activeTrade).toBeNull();
  });

  it('consuma apenas uma negociação por proposta', () => {
    let s = comProposta();
    const tradeId = s.activeTrade!.id;
    s = grant(s, 'carla', { ore: 2 });

    s = apply(s, { type: 'tradeRespond', player: 'bruno', tradeId, response: { type: 'accept' } });
    s = apply(s, { type: 'tradeRespond', player: 'carla', tradeId, response: { type: 'accept' } });
    s = apply(s, { type: 'tradeConfirm', player: 'ana', tradeId, withPlayer: 'bruno' });

    // A proposta morre na consumação; a Carla não é atendida.
    expectError(
      s,
      { type: 'tradeConfirm', player: 'ana', tradeId, withPlayer: 'carla' },
      'TRADE_EXPIRED',
    );
  });

  it('aceita contraproposta e usa os termos dela', () => {
    let s = comProposta();
    const tradeId = s.activeTrade!.id;
    s = grant(s, 'bruno', { ore: 2 });

    // Bruno quer 2 madeiras pela 1 pedra.
    s = apply(s, {
      type: 'tradeRespond',
      player: 'bruno',
      tradeId,
      response: {
        type: 'counter',
        terms: { give: conta({ lumber: 2 }), receive: conta({ ore: 1 }) },
      },
    });
    s = apply(s, { type: 'tradeConfirm', player: 'ana', tradeId, withPlayer: 'bruno' });

    expect(s.players.find((p) => p.id === 'ana')!.resources.lumber).toBe(0);
    expect(s.players.find((p) => p.id === 'ana')!.resources.ore).toBe(1);
    expect(s.players.find((p) => p.id === 'bruno')!.resources.lumber).toBe(2);
  });

  it('não consuma com quem recusou nem com quem não respondeu', () => {
    let s = comProposta();
    const tradeId = s.activeTrade!.id;

    s = apply(s, { type: 'tradeRespond', player: 'bruno', tradeId, response: { type: 'decline' } });
    expectError(
      s,
      { type: 'tradeConfirm', player: 'ana', tradeId, withPlayer: 'bruno' },
      'TRADE_NOT_ACCEPTED',
    );
    expectError(
      s,
      { type: 'tradeConfirm', player: 'ana', tradeId, withPlayer: 'carla' },
      'TRADE_NOT_ACCEPTED',
    );
  });

  it('recusa resposta de quem não é destinatário', () => {
    const s = comProposta();
    expectError(
      s,
      {
        type: 'tradeRespond',
        player: 'davi',
        tradeId: s.activeTrade!.id,
        response: { type: 'accept' },
      },
      'INVALID_TRADE',
    );
  });

  it('recusa resposta a proposta que já não existe', () => {
    const s = comProposta();
    expectError(
      s,
      { type: 'tradeRespond', player: 'bruno', tradeId: 'inexistente', response: { type: 'accept' } },
      'TRADE_EXPIRED',
    );
  });

  it('revalida os recursos NO INSTANTE da consumação (§3.5)', () => {
    let s = comProposta();
    const tradeId = s.activeTrade!.id;

    s = apply(s, { type: 'tradeRespond', player: 'bruno', tradeId, response: { type: 'accept' } });

    // Entre aceitar e consumar, o Bruno perde as pedras (roubo, monopólio,
    // qualquer coisa). A negociação tem que falhar.
    s = patch(s, (draft) => {
      const bruno = draft.players.find((p) => p.id === 'bruno')!;
      draft.bank.ore += bruno.resources.ore;
      bruno.resources.ore = 0;
    });

    expectError(
      s,
      { type: 'tradeConfirm', player: 'ana', tradeId, withPlayer: 'bruno' },
      'INSUFFICIENT_RESOURCES',
    );
  });

  it('revalida também o lado do proponente', () => {
    let s = comProposta();
    const tradeId = s.activeTrade!.id;
    s = apply(s, { type: 'tradeRespond', player: 'bruno', tradeId, response: { type: 'accept' } });

    s = patch(s, (draft) => {
      const ana = draft.players.find((p) => p.id === 'ana')!;
      draft.bank.lumber += ana.resources.lumber;
      ana.resources.lumber = 0;
    });

    expectError(
      s,
      { type: 'tradeConfirm', player: 'ana', tradeId, withPlayer: 'bruno' },
      'INSUFFICIENT_RESOURCES',
    );
  });

  it('uma nova proposta substitui a anterior', () => {
    let s = comProposta();
    const primeira = s.activeTrade!.id;

    s = apply(s, {
      type: 'tradeOffer',
      player: 'ana',
      terms: { give: conta({ lumber: 2 }), receive: conta({ grain: 1 }) },
      targets: ['carla'],
    });

    expect(s.activeTrade!.id).not.toBe(primeira);
    expectError(
      s,
      { type: 'tradeRespond', player: 'bruno', tradeId: primeira, response: { type: 'accept' } },
      'TRADE_EXPIRED',
    );
  });

  it('encerrar o turno cancela a proposta aberta', () => {
    let s = comProposta();
    s = apply(s, { type: 'endTurn', player: 'ana' });
    expect(s.activeTrade).toBeNull();
  });
});
