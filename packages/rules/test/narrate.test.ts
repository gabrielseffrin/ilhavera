/**
 * A narração dos eventos e das ações.
 *
 * A classe de bug vigiada aqui é chata e silenciosa: variante nova de evento
 * sem frase, ou frase que interpola um `undefined` porque alguém leu `actor`
 * numa variante que não tem ator. Nada disso quebra uma partida — só aparece
 * no log, em produção, e ninguém abre um chamado por causa de uma linha feia.
 *
 * A defesa principal não é uma lista escrita à mão: é narrar o log inteiro de
 * partidas de verdade, jogadas pelo mesmo driver dos testes de propriedade. O
 * que a lista à mão cobre é só o que uma partida aleatória não alcança — a
 * contraproposta, que o enumerador nunca gera, e os ramos de `null`.
 */

import { describe, expect, it } from 'vitest';

import { createGame } from '../src/game.js';
import { enumerateLegalActions } from '../src/legal.js';
import { activePlayers, rateFromPorts } from '../src/query.js';
import { toClientView } from '../src/view.js';
import { ACTION_LABELS } from '../src/labels.js';
import {
  describeAction,
  describeEdge,
  describeEvent,
  describeHex,
  describeResources,
  describeVertex,
  groupActions,
  ACTION_ORDER,
  type NarrationScope,
} from '../src/narrate.js';
import { emptyResourceCount } from '../src/types.js';
import type { ActionType } from '../src/actions/types.js';
import type { GameEvent, GameEventType } from '../src/state.js';
import { playRandomGame } from './helpers/driver.js';

/** Todas as variantes de evento que o motor sabe emitir. */
const TIPOS_DE_EVENTO: GameEventType[] = [
  'gameStarted',
  'settlementPlaced',
  'roadPlaced',
  'cityBuilt',
  'diceRolled',
  'resourcesProduced',
  'setupProduction',
  'discardRequired',
  'discarded',
  'robberMoved',
  'stolen',
  'devCardBought',
  'devCardPlayed',
  'monopolyResolved',
  'yearOfPlentyResolved',
  'bankTraded',
  'tradeOffered',
  'tradeResponded',
  'tradeCompleted',
  'longestRoadChanged',
  'largestArmyChanged',
  'turnEnded',
  'gameWon',
];

/** As cinco que são acontecimento da mesa, não de alguém. */
const SEM_ATOR: GameEventType[] = [
  'gameStarted',
  'resourcesProduced',
  'discardRequired',
  'longestRoadChanged',
  'largestArmyChanged',
];

const SEMENTES = ['narra-1', 'narra-2', 'narra-3', 'narra-4'];

function partidasNarradas(): { escopo: NarrationScope; log: readonly GameEvent[] }[] {
  return SEMENTES.map((seed) => {
    const { state } = playRandomGame(seed, { includeTradeOffers: true, maxSteps: 4000 });
    return { escopo: state, log: state.log };
  });
}

describe('describeEvent', () => {
  const partidas = partidasNarradas();

  it('narra todo evento de partidas reais sem deixar buraco', () => {
    for (const { escopo, log } of partidas) {
      for (const evento of log) {
        const texto = describeEvent(escopo, evento);
        expect(texto.length, `evento ${evento.type} sem texto`).toBeGreaterThan(0);
        expect(texto, `evento ${evento.type} interpolou undefined`).not.toContain('undefined');
      }
    }
  });

  it('alcança todas as variantes menos as que o enumerador nunca gera', () => {
    const vistos = new Set<GameEventType>();
    for (const { log } of partidas) for (const e of log) vistos.add(e.type);

    // Se alguma faltar, ou o motor parou de emiti-la ou o driver ficou cego
    // para um caminho — nos dois casos é notícia, não ruído de teste.
    for (const tipo of TIPOS_DE_EVENTO) {
      expect([...vistos], `variante ${tipo} nunca apareceu em 4 partidas`).toContain(tipo);
    }
  });

  it('nunca escreve o id cru de um jogador', () => {
    // Nem toda frase nomeia o ator — `turnEnded` fala de quem *entra*, não de
    // quem saiu. O que não pode acontecer em frase nenhuma é sair "p2" no lugar
    // de "Jogador 3", que é o defeito de esquecer de resolver o nome.
    for (const { escopo, log } of partidas) {
      const ids = escopo.players.map((p) => p.id);
      for (const evento of log) {
        const texto = describeEvent(escopo, evento);
        for (const id of ids) {
          expect(texto, `evento ${evento.type} vazou o id ${id}`).not.toMatch(
            new RegExp(`\\b${id}\\b`),
          );
        }
      }
    }
  });

  it('nomeia todo jogador citado, quando o nome é injetado', () => {
    for (const { escopo, log } of partidas) {
      for (const evento of log) {
        if (!('actor' in evento)) continue;
        expect(describeEvent(escopo, evento, { playerName: () => 'FULANO' })).toContain('FULANO');
      }
    }
  });

  it('narra as cinco variantes sem ator sem inventar um', () => {
    for (const { escopo, log } of partidas) {
      for (const evento of log) {
        if (!SEM_ATOR.includes(evento.type)) continue;
        expect('actor' in evento).toBe(false);
        expect(describeEvent(escopo, evento).length).toBeGreaterThan(0);
      }
    }
  });

  it('usa o nome injetado quando há um', () => {
    const { escopo, log } = partidas[0] as (typeof partidas)[number];
    const evento = log.find((e) => e.type === 'settlementPlaced');
    if (evento === undefined || !('actor' in evento)) throw new Error('partida sem assentamento');

    const texto = describeEvent(escopo, evento, { playerName: () => 'FULANO' });
    expect(texto).toContain('FULANO');
  });

  it('conta o roubo sem o recurso quando a projeção o escondeu', () => {
    const { escopo, log } = partidas[0] as (typeof partidas)[number];
    const roubo = log.find((e) => e.type === 'stolen');
    if (roubo === undefined || roubo.type !== 'stolen') throw new Error('partida sem roubo');

    const escondido: GameEvent = { ...roubo, data: { ...roubo.data, resource: null } };
    expect(describeEvent(escopo, escondido)).toContain('uma carta');
    expect(describeEvent(escopo, escondido)).not.toContain('undefined');
  });

  it('narra bônus que ficaram sem dono', () => {
    const { escopo } = partidas[0] as (typeof partidas)[number];

    const estrada: GameEvent = {
      type: 'longestRoadChanged',
      data: { owner: null, length: 0 },
    };
    const exercito: GameEvent = {
      type: 'largestArmyChanged',
      data: { owner: null, size: 0 },
    };

    expect(describeEvent(escopo, estrada)).toContain('sem dono');
    expect(describeEvent(escopo, exercito)).toContain('sem dono');
  });

  it('narra a contraproposta, que o enumerador nunca oferece', () => {
    const { escopo, log } = partidas[0] as (typeof partidas)[number];
    const original = log.find((e) => e.type === 'tradeResponded');
    if (original === undefined || original.type !== 'tradeResponded') {
      throw new Error('partida sem resposta de troca');
    }

    const contra: GameEvent = {
      ...original,
      data: {
        ...original.data,
        response: {
          type: 'counter',
          terms: { give: emptyResourceCount(), receive: emptyResourceCount() },
        },
      },
    };

    expect(describeEvent(escopo, contra)).toContain('contrapropôs');
  });

  it('serve a projeção do cliente sem conversão', () => {
    const { escopo, log } = partidas[0] as (typeof partidas)[number];
    const primeiro = escopo.players[0];
    if (primeiro === undefined) throw new Error('mesa vazia');

    // `ClientView` satisfaz `NarrationScope` estruturalmente — é isto que faz a
    // narração atravessar a Fase 4 sem uma linha de mudança.
    const vista = toClientView(escopo as never, primeiro.id);
    const evento = log[1] as GameEvent;
    expect(describeEvent(vista, evento)).toBe(describeEvent(escopo, evento));
  });
});

describe('descrições do tabuleiro', () => {
  const jogo = createGame({
    id: 'narra',
    seed: 'narra',
    players: [
      { id: 'ana', name: 'Ana', color: 'red' },
      { id: 'bruno', name: 'Bruno', color: 'blue' },
      { id: 'carla', name: 'Carla', color: 'white' },
    ],
    shufflePlayerOrder: false,
  });

  it('descreve um vértice pelos terrenos que ele toca', () => {
    const vertexId = jogo.board.vertexOrder[0] as string;
    const texto = describeVertex(jogo.board, vertexId);

    expect(texto.length).toBeGreaterThan(0);
    expect(texto).not.toBe(vertexId);
    // Um vértice toca até 3 hexágonos; o separador é a barra.
    expect(texto.split('/').length).toBeLessThanOrEqual(3);
  });

  it('descreve o deserto como hexágono sem ficha', () => {
    const deserto = jogo.board.hexOrder.find((h) => jogo.board.hexes[h]?.terrain === 'desert');
    if (deserto === undefined) throw new Error('tabuleiro sem deserto');

    expect(describeHex(jogo.board, deserto)).toContain('sem ficha');
  });

  it('devolve o próprio id quando ele não existe, em vez de explodir', () => {
    expect(describeVertex(jogo.board, 'nao-existe')).toBe('nao-existe');
    expect(describeEdge(jogo.board, 'nem-esta')).toBe('nem-esta');
    expect(describeHex(jogo.board, 'sumiu')).toBe('sumiu');
  });

  it('descreve uma mão vazia como "nada"', () => {
    expect(describeResources(emptyResourceCount())).toBe('nada');

    const mao = emptyResourceCount();
    mao.ore = 2;
    expect(describeResources(mao)).toBe('2× Minério');
  });
});

describe('rótulos e agrupamento de ações', () => {
  it('tem rótulo não vazio para todo tipo de ação', () => {
    for (const tipo of ACTION_ORDER) {
      expect(ACTION_LABELS[tipo].length, `ação ${tipo} sem rótulo`).toBeGreaterThan(0);
    }
  });

  it('ordena todos os tipos de ação, sem repetir nem faltar', () => {
    const doRecord = Object.keys(ACTION_LABELS) as ActionType[];
    expect(new Set(ACTION_ORDER).size).toBe(ACTION_ORDER.length);
    expect([...ACTION_ORDER].sort()).toEqual([...doRecord].sort());
  });

  it('descreve o alvo de toda ação legal de partidas reais', () => {
    for (const seed of SEMENTES.slice(0, 2)) {
      const { state } = playRandomGame(seed, { maxSteps: 400 });
      const ator = activePlayers(state)[0];
      if (ator === undefined) continue;

      for (const acao of enumerateLegalActions(state, ator, { includeTradeOffers: true })) {
        expect(describeAction(state, acao)).not.toContain('undefined');
      }
    }
  });

  it('agrupa por tipo na ordem de exibição, e rolar vem antes de encerrar', () => {
    const jogo = createGame({
      id: 'grupos',
      seed: 'grupos',
      players: [
        { id: 'ana', name: 'Ana', color: 'red' },
        { id: 'bruno', name: 'Bruno', color: 'blue' },
        { id: 'carla', name: 'Carla', color: 'white' },
      ],
      shufflePlayerOrder: false,
    });

    const acoes = enumerateLegalActions(jogo, 'ana');
    const grupos = groupActions(acoes);

    expect(grupos.length).toBeGreaterThan(0);
    // Nenhuma ação se perde no agrupamento.
    expect(grupos.reduce((n, g) => n + g.actions.length, 0)).toBe(acoes.length);
    for (const grupo of grupos) {
      expect(grupo.actions.every((a) => a.type === grupo.type)).toBe(true);
    }

    const posicoes = grupos.map((g) => ACTION_ORDER.indexOf(g.type));
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
  });

  it('agrupa lista vazia em lista vazia', () => {
    expect(groupActions([])).toEqual([]);
  });
});

describe('activePlayers', () => {
  const base = createGame({
    id: 'ator',
    seed: 'ator',
    players: [
      { id: 'ana', name: 'Ana', color: 'red' },
      { id: 'bruno', name: 'Bruno', color: 'blue' },
      { id: 'carla', name: 'Carla', color: 'white' },
    ],
    shufflePlayerOrder: false,
  });

  it('devolve o jogador da vez quando nada mais está pendente', () => {
    expect(activePlayers(base)).toEqual(['ana']);
  });

  it('devolve todos os devedores no descarte, e não o jogador da vez', () => {
    const descartando = {
      ...base,
      phase: 'discarding' as const,
      pendingDiscards: { bruno: 4, carla: 3 },
    };

    expect(activePlayers(descartando).sort()).toEqual(['bruno', 'carla']);
  });

  it('devolve quem ainda não respondeu a uma proposta aberta', () => {
    const negociando = {
      ...base,
      phase: 'main' as const,
      activeTrade: {
        id: 't1',
        proposer: 'ana',
        terms: { give: emptyResourceCount(), receive: emptyResourceCount() },
        targets: ['bruno', 'carla'],
        responses: { bruno: { type: 'decline' as const } },
      },
    };

    expect(activePlayers(negociando)).toEqual(['carla']);
  });

  it('volta ao jogador da vez quando todos já responderam', () => {
    const respondido = {
      ...base,
      phase: 'main' as const,
      activeTrade: {
        id: 't1',
        proposer: 'ana',
        terms: { give: emptyResourceCount(), receive: emptyResourceCount() },
        targets: ['bruno'],
        responses: { bruno: { type: 'accept' as const } },
      },
    };

    expect(activePlayers(respondido)).toEqual(['ana']);
  });
});

describe('rateFromPorts', () => {
  it('dá 4:1 sem porto, 3:1 com genérico e 2:1 com o específico', () => {
    expect(rateFromPorts([], 'ore')).toBe(4);
    expect(rateFromPorts(['generic'], 'ore')).toBe(3);
    expect(rateFromPorts(['generic', 'ore'], 'ore')).toBe(2);
    // O porto específico de outro recurso não ajuda neste.
    expect(rateFromPorts(['wool'], 'ore')).toBe(4);
  });
});
