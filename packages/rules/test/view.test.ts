/**
 * Segurança de informação — §8, nível 3 do roadmap.
 *
 * "Para qualquer estado, o objeto serializado para o jogador X **não contém**
 * as cartas de Y. Verificação por varredura recursiva do JSON."
 *
 * O método aqui é marcar cada segredo com um valor-sentinela único e depois
 * varrer o JSON inteiro procurando por ele. Comparar campo a campo testaria só
 * os vazamentos que eu lembrei de imaginar; a varredura pega os que eu não
 * imaginei — inclusive um campo novo que alguém adicione no futuro.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { toClientView } from '../src/view.js';
import { victoryPoints } from '../src/scoring/victory.js';
import { playRandomGame } from './helpers/driver.js';
import {
  apply,
  clearHand,
  completeSetup,
  giveDevCard,
  grant,
  newGame,
  patch,
} from './helpers/setup.js';
import { clearBuildingsOnHex, hexVertices, placeBuilding } from './helpers/board.js';
import type { GameState } from '../src/state.js';

/** Percorre o JSON e devolve todos os valores primitivos encontrados. */
function todosOsValores(value: unknown, out: unknown[] = []): unknown[] {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    for (const item of value) todosOsValores(item, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      todosOsValores(v, out);
    }
    return out;
  }
  out.push(value);
  return out;
}

describe('toClientView: informação oculta', () => {
  it('não expõe a mão de recursos dos adversários, só o total', () => {
    let s = completeSetup(newGame());
    for (const p of s.players) s = clearHand(s, p.id);
    s = grant(s, 'bruno', { ore: 3, wool: 2 });

    const view = toClientView(s, 'ana');
    const bruno = view.players.find((p) => p.id === 'bruno')!;

    expect(bruno.resourceCount).toBe(5);
    expect(bruno).not.toHaveProperty('resources');
    expect(bruno).not.toHaveProperty('devCards');
  });

  it('expõe a própria mão completa', () => {
    let s = completeSetup(newGame());
    s = clearHand(s, 'ana');
    s = grant(s, 'ana', { ore: 3 });

    const view = toClientView(s, 'ana');
    expect(view.you!.resources.ore).toBe(3);
    expect(view.you!.resourceCount).toBe(3);
  });

  it('não expõe o conteúdo nem a ordem do baralho, só o tamanho', () => {
    const s = completeSetup(newGame());
    const view = toClientView(s, 'ana') as unknown as Record<string, unknown>;

    expect(view['devDeck']).toBeUndefined();
    expect((view as { devDeckSize: number }).devDeckSize).toBe(25);
  });

  it('não expõe as Cartas de Progresso alheias, só a contagem de não jogadas', () => {
    let s = completeSetup(newGame());
    s = giveDevCard(s, 'bruno', 'victoryPoint');
    s = giveDevCard(s, 'bruno', 'monopoly');
    s = patch(s, (draft) => {
      draft.players.find((p) => p.id === 'bruno')!.devCards[1]!.played = true;
    });

    const bruno = toClientView(s, 'ana').players.find((p) => p.id === 'bruno')!;
    expect(bruno.devCardCount).toBe(1);
  });

  it('não conta as cartas de PV alheias na pontuação pública', () => {
    let s = completeSetup(newGame());
    s = giveDevCard(s, 'bruno', 'victoryPoint');
    s = giveDevCard(s, 'bruno', 'victoryPoint');

    const view = toClientView(s, 'ana');
    const bruno = view.players.find((p) => p.id === 'bruno')!;
    const real = victoryPoints(s, 'bruno', true).total;

    expect(bruno.victoryPointsPublic).toBe(real - 2);
  });

  it('mostra ao próprio jogador os PV reais, com as cartas ocultas', () => {
    let s = completeSetup(newGame());
    s = giveDevCard(s, 'ana', 'victoryPoint');
    const view = toClientView(s, 'ana');
    expect(view.you!.victoryPointsTotal).toBe(view.you!.victoryPointsPublic + 1);
  });

  it('esconde de terceiros QUAL recurso foi roubado', () => {
    // O log é o vazamento fácil de esquecer: filtra-se o estado e deixa-se o
    // histórico contando tudo.
    let s = completeSetup(newGame());
    for (const p of s.players) s = clearHand(s, p.id);

    const hexId = s.board.hexOrder.find((h) => h !== s.robberHex)!;
    s = clearBuildingsOnHex(s, hexId);
    s = placeBuilding(s, 'bruno', hexVertices(s, hexId)[0]!, 'settlement');
    s = grant(s, 'bruno', { ore: 2 });
    s = patch(s, (draft) => {
      draft.phase = 'movingRobber';
      draft.robberReturnPhase = 'main';
    });
    s = apply(s, { type: 'moveRobber', player: 'ana', hexId, stealFrom: 'bruno' });

    const evento = (id: string | null) =>
      toClientView(s, id).log.find((e) => e.type === 'stolen') as
        { data: { resource: string | null } } | undefined;

    // Ladrão e vítima veem; o resto da mesa, não.
    expect(evento('ana')!.data.resource).toBe('ore');
    expect(evento('bruno')!.data.resource).toBe('ore');
    expect(evento('carla')!.data.resource).toBeNull();
    expect(evento('davi')!.data.resource).toBeNull();
    expect(evento(null)!.data.resource).toBeNull();
  });

  it('não devolve nada de ninguém para espectador', () => {
    let s = completeSetup(newGame());
    s = grant(s, 'ana', { ore: 3 });
    const view = toClientView(s, null);
    expect(view.you).toBeNull();
    for (const p of view.players) {
      expect(p).not.toHaveProperty('resources');
    }
  });
});

describe('toClientView: varredura recursiva por sentinelas', () => {
  /**
   * Marca a mão e as cartas de cada adversário com valores impossíveis de
   * confundir e procura por eles no JSON inteiro da visão.
   */
  it('não deixa escapar nenhum segredo alheio em estado montado', () => {
    let s = completeSetup(newGame());
    for (const p of s.players) s = clearHand(s, p.id);

    // Quantidades-sentinela grandes o bastante para não colidirem com nenhum
    // valor legítimo e público (peças restantes, fichas, versão, banco).
    s = grant(s, 'bruno', { ore: 90013, wool: 90017 });
    s = giveDevCard(s, 'bruno', 'victoryPoint');
    s = giveDevCard(s, 'carla', 'monopoly');
    s = patch(s, (draft) => {
      // Marca o boughtOnTurn com um valor improvável para rastrear.
      for (const p of draft.players) {
        if (p.id === 'ana') continue;
        for (const c of p.devCards) c.boughtOnTurn = 9973;
      }
    });

    const view = toClientView(s, 'ana');
    const valores = todosOsValores(JSON.parse(JSON.stringify(view)));

    expect(valores).not.toContain(9973);
    // As contagens individuais do adversário não podem aparecer em lugar
    // nenhum. O total agregado pode, e deve.
    const bruno = view.players.find((p) => p.id === 'bruno')!;
    expect(bruno.resourceCount).toBe(180030);
    expect(valores).not.toContain(90013);
    expect(valores).not.toContain(90017);
  });

  it('vale para qualquer estado alcançável de uma partida real', () => {
    // Reforço gerado: em vez de um estado montado à mão, estados reais tirados
    // de partidas completas.
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 200 }), (n) => {
        const estados: GameState[] = [];
        playRandomGame(`view-${n}`, {
          maxSteps: 400,
          onStep: ({ state, step }) => {
            if (step % 40 === 0) estados.push(state);
          },
        });

        for (const state of estados) {
          for (const espectador of state.players) {
            const view = toClientView(state, espectador.id);
            const json = JSON.parse(JSON.stringify(view));

            // Nenhuma chave `resources` ou `devCards` de outro jogador.
            for (const p of (json as { players: Record<string, unknown>[] }).players) {
              expect(p['resources']).toBeUndefined();
              expect(p['devCards']).toBeUndefined();
            }
            expect((json as Record<string, unknown>)['devDeck']).toBeUndefined();

            // A contagem publicada bate com a mão real.
            for (const p of view.players) {
              const real = state.players.find((x) => x.id === p.id)!;
              const total = Object.values(real.resources).reduce((a, b) => a + b, 0);
              expect(p.resourceCount).toBe(total);
            }
          }
        }
      }),
      { numRuns: 15 },
    );
  });
});
