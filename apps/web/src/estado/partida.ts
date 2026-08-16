/**
 * O estado da partida no navegador.
 *
 * A promessa que a Fase 3 fez está cumprida aqui: `jogo` sumiu, `mesa` passou a
 * vir do `state:snapshot`, `executar` manda comando em vez de chamar `reduce` —
 * **e nenhum componente mudou**. A interface consome `mesa`, que é o
 * `ClientView` de `toClientView`, exatamente como consumia.
 *
 * O que mudou de forma foi a origem: um `Driver` atrás da mesma superfície. O
 * motor local continua servindo o hot-seat (desenvolver sem servidor é entrega
 * da Fase 3, não rascunho), e o socket serve a partida de verdade.
 *
 * `enumerateLegalActions` não aparece mais neste arquivo. No hot-seat ele mora
 * no `motorLocal`, onde o `GameState` existe; em rede a lista vem pronta do
 * servidor, porque enumerar precisa do estado cru que o cliente não tem — e não
 * pode ter.
 */

import { createStore, useStore, type StoreApi } from 'zustand';

import type { Action, ClientView, PlayerId } from '@ilhavera/rules';

import type { EstadoDaConexao } from '../rede/conexao.js';
import { quemAge, type Driver, type Modo } from './driver.js';

export type EstadoDaPartida = {
  modo: Modo;
  /** O que a interface consome. `null` enquanto não há partida — no lobby. */
  mesa: ClientView | null;
  /** Quem a mesa está esperando — nem sempre o jogador da vez. */
  ativo: PlayerId | null;
  /** As jogadas oferecidas agora. Em rede, vêm do servidor. */
  legais: Action[];
  /**
   * Última recusa. `string`, e não `ErrorCode`: o `Ack` do contrato declara
   * `error: string` de propósito, para que um cliente desatualizado consiga
   * dizer alguma coisa diante de um código que ainda não conhece.
   */
  erro: string | null;
  conexao: EstadoDaConexao;
  /**
   * Quantas jogadas **minhas** foram aceitas.
   *
   * Existe por causa dos modais. No hot-seat, "a versão andou" e "a minha jogada
   * foi aceita" eram a mesma coisa, e fechar o que estivesse aberto a cada
   * versão funcionava. Em rede não são: a jogada de qualquer adversário andaria
   * a versão e fecharia o compositor de troca no meio da digitação.
   */
  minhasJogadas: number;
  /**
   * Quando a mesa para de esperar, em epoch. `null` sem relógio — que é o padrão
   * e o único caso do hot-seat.
   *
   * Fora de `mesa` porque não é estado de jogo: o motor não pode ler o relógio
   * (§4.1), e o prazo é do servidor. Ver `Instantaneo.prazo`.
   */
  prazo: number | null;

  executar: (acao: Action) => void;
  reiniciar: (seed?: string) => void;
  limparErro: () => void;
};

export type StoreDaPartida = StoreApi<EstadoDaPartida>;

export function criarStoreDaPartida(driver: Driver): StoreDaPartida {
  const inicial = driver.inicial();

  const store = createStore<EstadoDaPartida>((set, get) => ({
    modo: driver.modo,
    mesa: inicial?.mesa ?? null,
    ativo: inicial === undefined || inicial === null ? null : quemAge(inicial.mesa),
    legais: inicial?.legais ?? [],
    erro: null,
    conexao: 'ligando',
    minhasJogadas: 0,
    prazo: inicial?.prazo ?? null,

    executar: (acao) => {
      driver.executar(acao);
    },

    reiniciar: (seed) => {
      driver.reiniciar?.(seed);
      set({ erro: null });
    },

    limparErro: () => {
      if (get().erro !== null) set({ erro: null });
    },
  }));

  driver.assinar({
    aoMudar: ({ mesa, legais, prazo }) => {
      store.setState({
        mesa,
        legais,
        prazo: prazo ?? null,
        ativo: quemAge(mesa),
        // A recusa some quando alguma coisa anda: manter o alerta depois da
        // jogada seguinte faria o erro acompanhar o jogador por três turnos.
        erro: null,
        minhasJogadas: driver.minhasJogadas(),
      });
    },
    aoErrar: (codigo) => {
      store.setState({ erro: codigo });
    },
    aoMudarConexao: (conexao) => {
      store.setState({ conexao });
    },
  });

  return store;
}

/** Hook sobre um store da partida — o padrão do zustand com store injetável. */
export function useStoreDaPartida<T>(store: StoreDaPartida, seletor: (s: EstadoDaPartida) => T): T {
  return useStore(store, seletor);
}
