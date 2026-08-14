/**
 * O store da partida e o motor local por trás dele.
 *
 * Três garantias vivem aqui, e as três são sobre a fronteira que a Fase 4
 * atravessou:
 *
 * - **`mesa` é a projeção, não o estado.** É o mesmo objeto que o servidor emite
 *   em `state:snapshot`. Se o store passasse a expor o estado cru "só para
 *   facilitar", a interface inteira dependeria de um formato que o socket nunca
 *   entrega;
 * - **o `GameState` não é alcançável pelo store.** Ele existe dentro do motor
 *   local e em nenhum outro lugar. Em rede não existe;
 * - **quem age nem sempre é o jogador da vez.** No descarte todos os devedores
 *   agem em paralelo, e `mesa` precisa acompanhar: quem está descartando tem que
 *   ver a própria mão, não a de quem rolou o dado.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { GameState } from '@ilhavera/rules';

import { quemAge } from '../src/estado/driver.js';
import { criarMotorLocal, type DriverLocal } from '../src/estado/motorLocal.js';
import { criarStoreDaPartida, type StoreDaPartida } from '../src/estado/partida.js';

let motor: DriverLocal;
let store: StoreDaPartida;

/** A mesa, sem o `null` do lobby: no hot-seat ela existe desde o início. */
function mesa(): NonNullable<ReturnType<StoreDaPartida['getState']>['mesa']> {
  const atual = store.getState().mesa;
  if (atual === null) throw new Error('hot-seat sem mesa');
  return atual;
}

beforeEach(() => {
  motor = criarMotorLocal('store');
  store = criarStoreDaPartida(motor);
});

describe('projeção', () => {
  it('entrega a mão de quem está agindo e esconde a dos outros', () => {
    const { ativo } = store.getState();

    expect(ativo).not.toBeNull();
    expect(mesa().you?.id).toBe(ativo);
    expect(mesa().you).toHaveProperty('resources');

    for (const p of mesa().players) {
      // A projeção troca a mão pelo total agregado — inclusive a do próprio
      // jogador na lista pública, que é onde é fácil escorregar.
      expect(p).not.toHaveProperty('resources');
      expect(p).not.toHaveProperty('devCards');
      expect(typeof p.resourceCount).toBe('number');
    }
  });

  it('não expõe o baralho de Cartas de Progresso, só o tamanho', () => {
    expect(mesa()).not.toHaveProperty('devDeck');
    expect(mesa().devDeckSize).toBe(25);
  });

  it('anda a versão junto com o estado a cada jogada aceita', () => {
    const antes = mesa().version;
    const primeira = store.getState().legais[0];
    if (primeira === undefined) throw new Error('setup sem jogada legal');

    store.getState().executar(primeira);

    expect(mesa().version).toBe(antes + 1);
    expect(mesa().version).toBe(motor.estado().version);
  });

  it('o store não dá acesso ao `GameState` — nem por engano', () => {
    expect(store.getState()).not.toHaveProperty('jogo');
    expect(store.getState()).not.toHaveProperty('estado');
  });
});

describe('executar', () => {
  it('guarda a recusa e não mexe no estado', () => {
    const antes = motor.estado();
    const naoEDaVez = antes.players.find((p) => p.id !== quemAge(antes));
    if (naoEDaVez === undefined) throw new Error('mesa de um jogador só');

    store.getState().executar({
      type: 'placeSettlement',
      player: naoEDaVez.id,
      vertexId: antes.board.vertexOrder[0] as string,
    });

    expect(store.getState().erro).toBe('NOT_YOUR_TURN');
    expect(motor.estado()).toBe(antes);
  });

  it('limpa o erro na jogada seguinte que dá certo', () => {
    const legais = store.getState().legais;

    store.getState().executar({
      type: 'buildCity',
      player: quemAge(motor.estado()) as string,
      vertexId: motor.estado().board.vertexOrder[0] as string,
    });
    expect(store.getState().erro).not.toBeNull();

    store.getState().executar(legais[0] as (typeof legais)[number]);
    expect(store.getState().erro).toBeNull();
  });

  it('conta as jogadas minhas — é o que fecha os modais', () => {
    expect(store.getState().minhasJogadas).toBe(0);
    store.getState().executar(store.getState().legais[0] as never);
    expect(store.getState().minhasJogadas).toBe(1);
  });

  it('reiniciar volta à versão zero e troca de tabuleiro', () => {
    const antes = mesa();
    store.getState().executar(store.getState().legais[0] as never);
    expect(mesa().version).toBe(1);

    store.getState().reiniciar('outra-semente');
    const depois = mesa();

    expect(depois.version).toBe(0);
    expect(depois.board.hexOrder).toEqual(antes.board.hexOrder);
    // Mesmo grafo, outro sorteio de terrenos: a semente é o que muda.
    expect(depois.board.hexes).not.toEqual(antes.board.hexes);
  });
});

describe('quemAge', () => {
  it('devolve o jogador da vez fora de descarte e de proposta', () => {
    const jogo = motor.estado();
    expect(quemAge(jogo)).toBe(jogo.players[jogo.currentPlayerIndex]?.id);
  });

  it('durante o descarte responde um devedor, e não o jogador da vez', () => {
    const jogo = motor.estado();
    const descartando: GameState = {
      ...jogo,
      phase: 'discarding',
      pendingDiscards: { bruno: 4, carla: 2 },
    };

    expect(['bruno', 'carla']).toContain(quemAge(descartando));
    expect(quemAge(descartando)).not.toBe(jogo.players[jogo.currentPlayerIndex]?.id);
  });

  it('devolve nulo quando não há quem aja', () => {
    expect(quemAge({ ...motor.estado(), players: [] })).toBeNull();
  });

  /**
   * A mesma função sobre a projeção. É o que permite ao driver de rede derivar
   * `ativo` sem `GameState`: `activePlayers` pede `TurnScope`, e `ClientView`
   * satisfaz. Se um dia deixar de satisfazer, é aqui que se descobre.
   */
  it('responde igual sobre a projeção e sobre o estado cru', () => {
    expect(quemAge(mesa())).toBe(quemAge(motor.estado()));
  });
});
