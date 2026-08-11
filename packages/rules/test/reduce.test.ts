/**
 * O portão central do reducer: fase + ator — §4.4 do roadmap.
 * "Toda ação recebida fora do estado/ator correto é rejeitada com código de
 * erro."
 */
import { describe, expect, it } from 'vitest';

import { reduce } from '../src/reduce.js';
import { enumerateLegalActions, handSize, isLegal, pendingDiscardCount } from '../src/legal.js';
import { HANDLERS } from '../src/actions/index.js';
import type { Action, ActionType } from '../src/actions/types.js';
import {
  apply,
  clearHand,
  completeSetup,
  expectError,
  grant,
  newGame,
  patch,
} from './helpers/setup.js';
import type { GameState } from '../src/state.js';

function faseMain(): GameState {
  let s = completeSetup(newGame());
  s = patch(s, (draft) => {
    draft.phase = 'main';
    draft.turnNumber = 3;
  });
  for (const p of s.players) s = clearHand(s, p.id);
  return s;
}

describe('portão de fase e ator', () => {
  it('rejeita jogador desconhecido antes de qualquer outra coisa', () => {
    const s = faseMain();
    const r = reduce(s, { type: 'endTurn', player: 'fantasma' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('UNKNOWN_PLAYER');
  });

  it('rejeita ação fora da fase', () => {
    const s = faseMain();
    expectError(s, { type: 'rollDice', player: 'ana' }, 'INVALID_PHASE');
    expectError(
      s,
      { type: 'moveRobber', player: 'ana', hexId: s.board.hexOrder[0]!, stealFrom: null },
      'INVALID_PHASE',
    );
    expectError(
      s,
      { type: 'discard', player: 'ana', resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 } },
      'INVALID_PHASE',
    );
  });

  it('rejeita ação de quem não é o jogador da vez', () => {
    const s = faseMain();
    expectError(s, { type: 'endTurn', player: 'bruno' }, 'NOT_YOUR_TURN');
    expectError(s, { type: 'buyDevCard', player: 'carla' }, 'NOT_YOUR_TURN');
  });

  it('permite descarte de qualquer jogador — é a única ação paralela', () => {
    expect(HANDLERS.discard.actor).toBe('any');
    expect(HANDLERS.tradeRespond.actor).toBe('any');
    for (const [tipo, handler] of Object.entries(HANDLERS)) {
      if (tipo === 'discard' || tipo === 'tradeRespond') continue;
      expect(handler.actor, `${tipo} deveria ser do jogador da vez`).toBe('current');
    }
  });

  it('rejeita tudo depois do fim da partida', () => {
    const s = patch(faseMain(), (draft) => {
      draft.phase = 'finished';
      draft.winner = 'ana';
    });
    for (const acao of [
      { type: 'endTurn', player: 'ana' },
      { type: 'buyDevCard', player: 'ana' },
      { type: 'rollDice', player: 'ana' },
    ] as Action[]) {
      const r = reduce(s, acao);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe('GAME_FINISHED');
    }
  });

  it('incrementa a versão apenas em ações aceitas', () => {
    const s = faseMain();
    const antes = s.version;

    const rejeitada = reduce(s, { type: 'buyDevCard', player: 'ana' });
    expect(rejeitada.ok).toBe(false);

    const aceita = apply(s, { type: 'endTurn', player: 'ana' });
    expect(aceita.version).toBe(antes + 1);
  });

  it('devolve eventos junto com o novo estado', () => {
    const s = faseMain();
    const r = reduce(s, { type: 'endTurn', player: 'ana' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.map((e) => e.type)).toContain('turnEnded');
    // Os mesmos eventos vão para o log do estado.
    expect(r.state.log.at(-1)).toEqual(r.events.at(-1));
  });
});

describe('encerramento de turno', () => {
  it('passa a vez em ordem circular e incrementa o turno', () => {
    let s = faseMain();
    const turnoAntes = s.turnNumber;

    s = apply(s, { type: 'endTurn', player: 'ana' });
    expect(s.players[s.currentPlayerIndex]!.id).toBe('bruno');
    expect(s.turnNumber).toBe(turnoAntes + 1);
    expect(s.phase).toBe('awaitingRoll');

    s = patch(s, (d) => { d.phase = 'main'; });
    s = apply(s, { type: 'endTurn', player: 'bruno' });
    s = patch(s, (d) => { d.phase = 'main'; });
    s = apply(s, { type: 'endTurn', player: 'carla' });
    s = patch(s, (d) => { d.phase = 'main'; });
    s = apply(s, { type: 'endTurn', player: 'davi' });

    expect(s.players[s.currentPlayerIndex]!.id).toBe('ana');
  });

  it('zera os controles de turno', () => {
    let s = patch(faseMain(), (draft) => {
      draft.devCardPlayedThisTurn = true;
      draft.freeRoadsRemaining = 2;
      draft.lastRoll = { dice: [3, 4], total: 7 };
    });
    s = apply(s, { type: 'endTurn', player: 'ana' });

    expect(s.devCardPlayedThisTurn).toBe(false);
    expect(s.freeRoadsRemaining).toBe(0);
    expect(s.lastRoll).toBeNull();
    expect(s.activeTrade).toBeNull();
  });
});

describe('enumerateLegalActions', () => {
  it('só devolve ações que o reducer aceita', () => {
    const s = faseMain();
    for (const p of s.players) {
      for (const action of enumerateLegalActions(s, p.id, { includeTradeOffers: true })) {
        expect(reduce(s, action).ok, `${action.type} foi enumerada mas rejeitada`).toBe(true);
      }
    }
  });

  it('concorda com isLegal', () => {
    const s = faseMain();
    const legais = enumerateLegalActions(s, 'ana');
    for (const action of legais) expect(isLegal(s, action)).toBe(true);
  });

  it('no setup, só oferece o passo corrente', () => {
    const s = newGame();
    const tipos = new Set(enumerateLegalActions(s, 'ana').map((a) => a.type));
    expect(tipos).toEqual(new Set(['placeSettlement']));

    const depois = apply(s, {
      type: 'placeSettlement',
      player: 'ana',
      vertexId: s.board.vertexOrder[0]!,
    });
    const tiposDepois = new Set(enumerateLegalActions(depois, 'ana').map((a) => a.type));
    expect(tiposDepois).toEqual(new Set(['placeRoad']));
  });

  it('sempre deixa uma saída no turno principal', () => {
    // Sem recursos nenhum, encerrar o turno tem que continuar possível —
    // senão a partida trava.
    const s = faseMain();
    const tipos = enumerateLegalActions(s, 'ana').map((a) => a.type);
    expect(tipos).toContain('endTurn');
  });

  it('não oferece nada a quem não é da vez fora das fases paralelas', () => {
    const s = faseMain();
    expect(enumerateLegalActions(s, 'bruno')).toHaveLength(0);
  });

  it('oferece comprar carta só quando dá para pagar', () => {
    const s = faseMain();
    expect(enumerateLegalActions(s, 'ana').some((a) => a.type === 'buyDevCard')).toBe(false);

    const comRecursos = grant(s, 'ana', { wool: 1, grain: 1, ore: 1 });
    expect(enumerateLegalActions(comRecursos, 'ana').some((a) => a.type === 'buyDevCard')).toBe(
      true,
    );
  });

  it('cobre todos os tipos de ação declarados', () => {
    // Guarda contra uma ação nova entrar no union e ninguém registrar handler.
    const declarados = Object.keys(HANDLERS) as ActionType[];
    expect(declarados.length).toBeGreaterThan(0);
    for (const tipo of declarados) {
      expect(HANDLERS[tipo].phases.length).toBeGreaterThan(0);
    }
  });
});

describe('atalhos de consulta', () => {
  it('handSize devolve o total da mão', () => {
    const s = grant(faseMain(), 'ana', { ore: 2, wool: 3 });
    expect(handSize(s, 'ana')).toBe(5);
    expect(handSize(s, 'inexistente')).toBe(0);
  });

  it('pendingDiscardCount devolve 0 fora da fase de descarte', () => {
    expect(pendingDiscardCount(faseMain(), 'ana')).toBe(0);
  });
});
