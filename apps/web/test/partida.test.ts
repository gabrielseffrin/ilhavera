/**
 * O store da partida — a única peça da interface que conhece `GameState`.
 *
 * Duas garantias vivem aqui, e as duas são sobre a Fase 4:
 *
 * - **`mesa` é a projeção, não o estado.** É o mesmo objeto que o servidor
 *   emite em `state:snapshot`. Se um dia o store passar a expor o estado cru
 *   "só para facilitar", a interface inteira passa a depender de um formato que
 *   o socket nunca vai entregar — e a troca da Fase 4 deixa de ser um arquivo;
 * - **quem age nem sempre é o jogador da vez.** No descarte todos os devedores
 *   agem em paralelo, e `mesa` precisa acompanhar: quem está descartando tem
 *   que ver a própria mão, não a de quem rolou o dado.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { jogadasLegais, jogadorAtivo, quemAge, usePartida } from '../src/estado/partida.js';

beforeEach(() => {
  usePartida.getState().reiniciar('store');
});

describe('projeção', () => {
  it('entrega a mão de quem está agindo e esconde a dos outros', () => {
    const { mesa, ativo } = usePartida.getState();

    expect(ativo).not.toBeNull();
    expect(mesa.you?.id).toBe(ativo);
    expect(mesa.you).toHaveProperty('resources');

    for (const p of mesa.players) {
      // A projeção troca a mão pelo total agregado — inclusive a do próprio
      // jogador na lista pública, que é onde é fácil escorregar.
      expect(p).not.toHaveProperty('resources');
      expect(p).not.toHaveProperty('devCards');
      expect(typeof p.resourceCount).toBe('number');
    }
  });

  it('não expõe o baralho de Cartas de Progresso, só o tamanho', () => {
    const { mesa } = usePartida.getState();

    expect(mesa).not.toHaveProperty('devDeck');
    expect(mesa.devDeckSize).toBe(25);
  });

  it('anda a versão junto com o estado a cada jogada aceita', () => {
    const { mesa, legais } = usePartida.getState();
    const primeira = legais[0];
    if (primeira === undefined) throw new Error('setup sem jogada legal');

    usePartida.getState().executar(primeira);

    const depois = usePartida.getState();
    expect(depois.mesa.version).toBe(mesa.version + 1);
    expect(depois.mesa.version).toBe(depois.jogo.version);
  });
});

describe('executar', () => {
  it('guarda a recusa e não mexe no estado', () => {
    const antes = usePartida.getState().jogo;
    const naoEDaVez = antes.players.find((p) => p.id !== jogadorAtivo(antes));
    if (naoEDaVez === undefined) throw new Error('mesa de um jogador só');

    usePartida.getState().executar({
      type: 'placeSettlement',
      player: naoEDaVez.id,
      vertexId: antes.board.vertexOrder[0] as string,
    });

    const depois = usePartida.getState();
    expect(depois.erro).toBe('NOT_YOUR_TURN');
    expect(depois.jogo).toBe(antes);
  });

  it('limpa o erro na jogada seguinte que dá certo', () => {
    const { legais } = usePartida.getState();
    usePartida.getState().executar({
      type: 'buildCity',
      player: jogadorAtivo(usePartida.getState().jogo) as string,
      vertexId: usePartida.getState().jogo.board.vertexOrder[0] as string,
    });
    expect(usePartida.getState().erro).not.toBeNull();

    usePartida.getState().executar(legais[0] as (typeof legais)[number]);
    expect(usePartida.getState().erro).toBeNull();
  });

  it('reiniciar volta à versão zero e troca de tabuleiro', () => {
    const antes = usePartida.getState().mesa;
    usePartida.getState().executar(usePartida.getState().legais[0] as never);
    expect(usePartida.getState().mesa.version).toBe(1);

    usePartida.getState().reiniciar('outra-semente');
    const depois = usePartida.getState().mesa;

    expect(depois.version).toBe(0);
    expect(depois.board.hexOrder).toEqual(antes.board.hexOrder);
    // Mesmo grafo, outro sorteio de terrenos: a semente é o que muda.
    expect(depois.board.hexes).not.toEqual(antes.board.hexes);
  });
});

describe('quemAge', () => {
  it('devolve o jogador da vez fora de descarte e de proposta', () => {
    const jogo = usePartida.getState().jogo;
    expect(quemAge(jogo)).toEqual([jogo.players[jogo.currentPlayerIndex]?.id]);
  });

  it('devolve todos os devedores durante o descarte', () => {
    const jogo = usePartida.getState().jogo;
    const descartando = {
      ...jogo,
      phase: 'discarding' as const,
      pendingDiscards: { bruno: 4, carla: 2 },
    };

    expect(quemAge(descartando).sort()).toEqual(['bruno', 'carla']);
    expect(jogadorAtivo(descartando)).not.toBe(jogo.players[jogo.currentPlayerIndex]?.id);
  });

  it('não oferece jogada quando não há quem aja', () => {
    const jogo = usePartida.getState().jogo;
    const semJogadores = { ...jogo, players: [] };

    expect(jogadorAtivo(semJogadores)).toBeNull();
    expect(jogadasLegais(semJogadores)).toEqual([]);
  });
});
