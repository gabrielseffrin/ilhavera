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

import {
  applyClientViewPatch,
  projectEvents,
  toClientView,
  toClientViewDynamic,
  toClientViewStatic,
} from '../src/view.js';
import { reduce } from '../src/reduce.js';
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
import type { GameEvent, GameState } from '../src/state.js';
import type { PlayerId } from '../src/types.js';
import type { ClientView } from '../src/view.js';

/**
 * Todo objeto no JSON com a forma de um `VictoryBreakdown`.
 *
 * Busca por forma, e não pelo nome do campo, porque o que se quer garantir não é
 * "não existe uma chave chamada `finalScores`" — é "a decomposição dos pontos não
 * está alcançável por caminho nenhum". Um campo novo publicando a mesma coisa
 * com outro nome cai aqui do mesmo jeito.
 */
function decomposicoes(value: unknown, out: unknown[] = []): unknown[] {
  if (value === null || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const item of value) decomposicoes(item, out);
    return out;
  }

  const chaves = Object.keys(value);
  const assinatura = ['settlements', 'cities', 'largestArmy', 'longestRoad', 'devCards', 'total'];
  if (assinatura.every((c) => chaves.includes(c))) out.push(value);

  for (const v of Object.values(value)) decomposicoes(v, out);
  return out;
}

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

/**
 * O placar aberto é a única coisa nesta projeção que **deixa** de ser oculta, e
 * por isso precisa dos dois lados testados. Um teste que só prova "não vaza
 * antes" passa mesmo se o placar nunca aparecer; um que só prova "aparece
 * depois" passa mesmo se aparecer o tempo todo. Nenhum dos dois sozinho diz o
 * que se quer saber.
 */
describe('toClientView: o placar aberto do fim de partida', () => {
  /** Bruno com duas cartas de PV na mão — os pontos que ninguém enxerga. */
  function mesaComPVOculto(): GameState {
    let s = completeSetup(newGame());
    s = giveDevCard(s, 'bruno', 'victoryPoint');
    s = giveDevCard(s, 'bruno', 'victoryPoint');
    return s;
  }

  function comVencedor(s: GameState): GameState {
    return patch(s, (draft) => {
      draft.winner = 'bruno';
      draft.phase = 'finished';
    });
  }

  it('não existe enquanto não há vencedor', () => {
    const view = toClientView(mesaComPVOculto(), 'ana');

    expect(view.winner).toBeNull();
    expect(view.finalScores).toBeNull();
  });

  it('com a partida em curso, nenhuma decomposição de PV é alcançável', () => {
    const s = mesaComPVOculto();
    const view = toClientView(s, 'ana');

    const publico = view.players.find((p) => p.id === 'bruno')!.victoryPointsPublic;
    expect(victoryPoints(s, 'bruno', true).total).toBe(publico + 2);

    /**
     * A varredura aqui é por **forma**, não por valor: um total de PV é um
     * inteiro pequeno que aparece legitimamente às centenas no JSON do
     * tabuleiro, então procurar pelo número não prova nada. Procurar por um
     * objeto com a cara de `VictoryBreakdown` prova — e continua provando se
     * alguém publicar a decomposição por um campo de nome diferente.
     */
    expect(decomposicoes(view)).toHaveLength(0);
  });

  it('com vencedor, revela de onde veio cada ponto de cada jogador', () => {
    const s = comVencedor(mesaComPVOculto());
    const view = toClientView(s, 'ana');

    expect(view.finalScores).not.toBeNull();
    expect(Object.keys(view.finalScores!).sort()).toEqual([...s.players.map((p) => p.id)].sort());
    // Uma decomposição por jogador, e nenhuma a mais escondida noutro canto.
    expect(decomposicoes(view)).toHaveLength(s.players.length);

    const bruno = view.finalScores!['bruno']!;
    expect(bruno.devCards).toBe(2);
    expect(bruno.total).toBe(victoryPoints(s, 'bruno', true).total);
    // A decomposição precisa fechar com o total, senão a tabela da tela conta
    // uma história que não soma.
    expect(
      bruno.settlements + bruno.cities + bruno.largestArmy + bruno.longestRoad + bruno.devCards,
    ).toBe(bruno.total);
  });

  it('revela o placar e **só** o placar: a mão de recursos continua oculta', () => {
    let s = mesaComPVOculto();
    for (const p of s.players) s = clearHand(s, p.id);
    s = grant(s, 'bruno', { ore: 90013, wool: 90017 });
    s = comVencedor(s);

    const view = toClientView(s, 'ana');
    const valores = todosOsValores(JSON.parse(JSON.stringify(view)));

    expect(view.finalScores).not.toBeNull();
    expect(valores).not.toContain(90013);
    expect(valores).not.toContain(90017);
    expect(view.players.find((p) => p.id === 'bruno')!).not.toHaveProperty('resources');
  });

  it('o espectador vê o mesmo placar — no fim não há mais o que esconder', () => {
    const s = comVencedor(mesaComPVOculto());

    expect(toClientView(s, null).finalScores).toEqual(toClientView(s, 'ana').finalScores);
  });
});

describe('projectEvents: a mesma fronteira, no canal do delta', () => {
  /** Monta um roubo de minério de `ana` em `bruno` e devolve os eventos crus. */
  function eventosDeUmRoubo(): readonly GameEvent[] {
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

    const resultado = reduce(s, { type: 'moveRobber', player: 'ana', hexId, stealFrom: 'bruno' });
    if (!resultado.ok) throw new Error(`roubo rejeitado: ${resultado.error}`);
    return resultado.events;
  }

  it('mascara o recurso roubado para quem não é ladrão nem vítima', () => {
    const eventos = eventosDeUmRoubo();
    const roubo = (id: string | null) =>
      projectEvents(eventos, id).find((e) => e.type === 'stolen') as
        { data: { from: string; resource: string | null } } | undefined;

    expect(roubo('ana')!.data.resource).toBe('ore');
    expect(roubo('bruno')!.data.resource).toBe('ore');
    expect(roubo('carla')!.data.resource).toBeNull();
    expect(roubo(null)!.data.resource).toBeNull();
    // Que houve roubo, e de quem, continua público — só o recurso some.
    expect(roubo('carla')!.data.from).toBe('bruno');
  });

  it('não altera os eventos sem informação oculta', () => {
    const eventos = eventosDeUmRoubo();
    const outros = eventos.filter((e) => e.type !== 'stolen');
    expect(outros.length).toBeGreaterThan(0);

    const projetados = projectEvents(eventos, 'carla').filter((e) => e.type !== 'stolen');
    expect(projetados).toEqual(outros);
  });

  it('preserva a ordem e a quantidade de eventos', () => {
    const eventos = eventosDeUmRoubo();
    const projetados = projectEvents(eventos, 'carla');
    expect(projetados.map((e) => e.type)).toEqual(eventos.map((e) => e.type));
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

/**
 * O corte estático/dinâmico existe para o `state:patch` da Fase 4: o cliente não
 * tem motor e não deriva estado de evento nenhum — ele recebe a metade que muda
 * e remonta. Se a remontagem não der exatamente o mesmo objeto que um
 * `state:snapshot` daria, o cliente passa a divergir do servidor calado, que é o
 * pior modo de falha possível num jogo autoritativo.
 */
describe('projeção partida em estático e dinâmico', () => {
  it('remonta, a cada jogada, a mesma projeção que o snapshot daria', () => {
    const seeds = ['patch-1', 'patch-2', 'patch-3'];

    for (const seed of seeds) {
      let anteriores = new Map<PlayerId, ClientView>();
      let comparacoes = 0;

      playRandomGame(seed, {
        includeTradeOffers: true,
        onStep: ({ state, events }) => {
          const atuais = new Map<PlayerId, ClientView>();

          for (const jogador of state.players) {
            const snapshot = toClientView(state, jogador.id);
            atuais.set(jogador.id, snapshot);

            const anterior = anteriores.get(jogador.id);
            if (anterior === undefined) continue;

            const remontado = applyClientViewPatch(
              anterior,
              toClientViewDynamic(state, jogador.id),
              projectEvents(events, jogador.id),
            );

            expect(remontado).toEqual(snapshot);
            comparacoes++;
          }

          anteriores = atuais;
        },
      });

      expect(comparacoes).toBeGreaterThan(100);
    }
  });

  it('a metade estática não muda do começo ao fim da partida', () => {
    const inicios: string[] = [];
    let primeiro: string | null = null;

    playRandomGame('estatico-1', {
      onStep: ({ state }) => {
        const atual = JSON.stringify(toClientViewStatic(state));
        primeiro ??= atual;
        if (atual !== primeiro) inicios.push(atual);
      },
    });

    expect(inicios).toEqual([]);
  });
});
