/**
 * O driver de rede: o que a tela faz com o que chega do socket.
 *
 * Três coisas precisam estar certas aqui, e nenhuma delas é regra de jogo:
 *
 * - **o patch remonta a projeção.** O cliente não tem motor; ele recebe a
 *   metade que muda e concatena os eventos ao log. Se a remontagem não der o
 *   mesmo objeto que um `state:snapshot` daria, a tela passa a contar uma
 *   partida ligeiramente diferente da que está acontecendo — e em silêncio;
 * - **um salto de versão vira `state:resync`.** Aplicar o patch seguinte por
 *   cima de um buraco é pior do que não atualizar, porque parece certo;
 * - **a recusa vem do ack.** É a resposta autoritativa; `game:error` traz a
 *   mesma informação e não é assinado, para o jogador não ver duas vezes o que
 *   aconteceu uma vez.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  createGame,
  enumerateLegalActions,
  projectEvents,
  reduce,
  toClientView,
  toClientViewDynamic,
  type Action,
  type GameState,
  type PlayerId,
} from '@ilhavera/rules';
import type { PatchPayload, SnapshotPayload } from '@ilhavera/protocol';

import { criarDriverDeRede } from '../src/estado/driverDeRede.js';
import { criarStoreDaPartida } from '../src/estado/partida.js';
import { conexaoFalsa } from './helpers/conexaoFalsa.js';

const JOGADORES = [
  { id: 'ana', name: 'Ana', color: 'red' as const },
  { id: 'bruno', name: 'Bruno', color: 'blue' as const },
  { id: 'carla', name: 'Carla', color: 'white' as const },
];

function snapshotDe(
  jogo: GameState,
  viewer: PlayerId,
  deadline: number | null = null,
): SnapshotPayload {
  return {
    view: toClientView(jogo, viewer),
    legal: enumerateLegalActions(jogo, viewer),
    deadline,
  };
}

function patchDe(
  jogo: GameState,
  viewer: PlayerId,
  eventos: readonly unknown[],
  deadline: number | null = null,
): PatchPayload {
  return {
    version: jogo.version,
    events: projectEvents(eventos as never, viewer),
    view: toClientViewDynamic(jogo, viewer),
    legal: enumerateLegalActions(jogo, viewer),
    deadline,
  };
}

/**
 * Uma partida de verdade, e quem a está jogando.
 *
 * O espectador é o jogador da vez porque a ordem de assentos é sorteada em
 * `createGame`: fixar um nome aqui faria o teste depender da semente e ficar
 * sem jogada legal nenhuma no dia em que ela mudasse.
 */
function partida(): {
  jogo: GameState;
  eu: PlayerId;
  jogar: (jogo: GameState) => ReturnType<typeof reduce>;
} {
  const jogo = createGame({ id: 'rede', seed: 'driver-de-rede', players: JOGADORES });
  const jogar = (atual: GameState): ReturnType<typeof reduce> => {
    const quem = atual.players[atual.currentPlayerIndex]?.id as PlayerId;
    const acao = enumerateLegalActions(atual, quem)[0] as Action;
    return reduce(atual, acao);
  };
  return { jogo, eu: jogo.players[jogo.currentPlayerIndex]?.id as PlayerId, jogar };
}

describe('driver de rede', () => {
  it('o snapshot vira a mesa, com a lista que o servidor mandou', () => {
    const conexao = conexaoFalsa();
    const store = criarStoreDaPartida(criarDriverDeRede(conexao));
    const { jogo, eu } = partida();

    expect(store.getState().mesa).toBeNull();

    conexao.emitir('state:snapshot', snapshotDe(jogo, eu));

    expect(store.getState().mesa?.version).toBe(0);
    expect(store.getState().mesa?.you?.id).toBe(eu);
    expect(store.getState().legais).toEqual(enumerateLegalActions(jogo, eu));
  });

  it('o patch remonta exatamente a projeção que um snapshot daria', () => {
    const conexao = conexaoFalsa();
    const store = criarStoreDaPartida(criarDriverDeRede(conexao));
    const { jogo, eu, jogar } = partida();

    conexao.emitir('state:snapshot', snapshotDe(jogo, eu));

    let atual = jogo;
    for (let i = 0; i < 8; i++) {
      const resultado = jogar(atual);
      if (!resultado.ok) throw new Error(`jogada recusada: ${resultado.error}`);
      atual = resultado.state;

      conexao.emitir('state:patch', patchDe(atual, eu, resultado.events));

      // A tese: o que a tela tem é o que o servidor teria mandado inteiro.
      expect(store.getState().mesa).toEqual(toClientView(atual, eu));
    }

    expect(atual.version).toBe(8);
  });

  it('ignora patch repetido ou atrasado — a reconexão traz os dois', () => {
    const conexao = conexaoFalsa();
    const store = criarStoreDaPartida(criarDriverDeRede(conexao));
    const { jogo, eu, jogar } = partida();

    const resultado = jogar(jogo);
    if (!resultado.ok) throw new Error('jogada recusada');

    conexao.emitir('state:snapshot', snapshotDe(resultado.state, eu));
    conexao.emitir('state:patch', patchDe(resultado.state, eu, resultado.events));

    expect(store.getState().mesa?.version).toBe(1);
    expect(conexao.enviados).toHaveLength(0);
  });

  it('um salto de versão pede state:resync em vez de aplicar por cima', () => {
    const conexao = conexaoFalsa();
    const store = criarStoreDaPartida(criarDriverDeRede(conexao));
    const { jogo, eu, jogar } = partida();

    conexao.emitir('state:snapshot', snapshotDe(jogo, eu));

    let atual = jogo;
    let ultimos: readonly unknown[] = [];
    for (let i = 0; i < 3; i++) {
      const resultado = jogar(atual);
      if (!resultado.ok) throw new Error('jogada recusada');
      atual = resultado.state;
      ultimos = resultado.events;
    }

    // Chega o patch da versão 3 com a tela ainda na 0: dois se perderam.
    conexao.emitir('state:patch', patchDe(atual, eu, ultimos));

    expect(conexao.enviados.map((c) => c.name)).toEqual(['state:resync']);
    // E a tela não avançou para um estado que ela não sabe montar.
    expect(store.getState().mesa?.version).toBe(0);
  });

  it('executar manda o comando do clique, sem adivinhar o resultado', async () => {
    const conexao = conexaoFalsa();
    const store = criarStoreDaPartida(criarDriverDeRede(conexao));
    const { jogo, eu } = partida();

    conexao.emitir('state:snapshot', snapshotDe(jogo, eu));
    const antes = store.getState().mesa?.version;

    const acao = store.getState().legais[0] as Action;
    store.getState().executar(acao);

    expect(conexao.enviados[0]?.name).toBe('game:placeSettlement');
    // Nada de atualização otimista: quem decide é o servidor.
    expect(store.getState().mesa?.version).toBe(antes);
  });

  it('a recusa do ack vira erro na tela', async () => {
    const conexao = conexaoFalsa();
    const store = criarStoreDaPartida(criarDriverDeRede(conexao));
    const { jogo, eu } = partida();

    conexao.emitir('state:snapshot', snapshotDe(jogo, eu));
    conexao.responder({ ok: false, error: 'NOT_YOUR_TURN' });

    store.getState().executar(store.getState().legais[0] as Action);
    await vi.waitFor(() => {
      expect(store.getState().erro).toBe('NOT_YOUR_TURN');
    });
  });

  it('conta só as jogadas aceitas deste cliente', async () => {
    const conexao = conexaoFalsa();
    const store = criarStoreDaPartida(criarDriverDeRede(conexao));
    const { jogo, eu, jogar } = partida();

    conexao.emitir('state:snapshot', snapshotDe(jogo, eu));
    expect(store.getState().minhasJogadas).toBe(0);

    // Jogada de outro: a versão anda, a minha contagem não. É o que impede o
    // modal de fechar sozinho quando o adversário joga.
    const resultado = jogar(jogo);
    if (!resultado.ok) throw new Error('jogada recusada');
    conexao.emitir('state:patch', patchDe(resultado.state, eu, resultado.events));

    expect(store.getState().mesa?.version).toBe(1);
    expect(store.getState().minhasJogadas).toBe(0);

    conexao.responder({ ok: true, data: { version: 2 } });
    store.getState().executar(store.getState().legais[0] as Action);
    await vi.waitFor(() => {
      expect(store.getState().minhasJogadas).toBe(1);
    });
  });
});
