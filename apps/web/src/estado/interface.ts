/**
 * O que está aberto na tela — e nada mais.
 *
 * Separado do store da partida de propósito: isto não é estado de jogo. Não vem
 * do servidor, não entra em snapshot, não se reconstrói a partir do estado.
 * Misturar as duas coisas num store só faria o `state:patch` do servidor decidir
 * se um modal está aberto, que é exatamente o tipo de acoplamento que a Fase 4
 * cobraria caro.
 *
 * `hexDoSaqueador` guarda o primeiro dos dois tempos do roubo: o hexágono é
 * escolhido no tabuleiro, a vítima no modal.
 *
 * É fábrica, e não singleton, pelo mesmo motivo que os outros dois stores: o
 * aceite da Fase 4 monta várias telas no mesmo documento, e com um store só o
 * modal de um jogador abriria na tela do outro.
 */

import { createStore, useStore, type StoreApi } from 'zustand';

import type { ActionOf, ActionType, HexId } from '@ilhavera/rules';

export type EstadoDaInterface = {
  /** Que grupo de jogadas está sendo escolhido, quando há mais de uma opção. */
  modalAberto: ActionType | null;
  /** Hexágono já escolhido para o Saqueador, aguardando a vítima. */
  hexDoSaqueador: HexId | null;
  /**
   * A resposta que vai virar contraproposta. Guardada inteira, e não só um
   * sinal, porque é ela que carrega o `tradeId` — o compositor precisa devolver
   * a resposta à proposta certa, e não à que estiver aberta quando ele fechar.
   */
  contrapondo: ActionOf<'tradeRespond'> | null;

  abrirModal: (tipo: ActionType) => void;
  escolherHex: (hexId: HexId) => void;
  contrapor: (resposta: ActionOf<'tradeRespond'>) => void;
  fechar: () => void;
};

export type StoreDaInterface = StoreApi<EstadoDaInterface>;

export function criarStoreDaInterface(): StoreDaInterface {
  return createStore<EstadoDaInterface>((set) => ({
    modalAberto: null,
    hexDoSaqueador: null,
    contrapondo: null,

    abrirModal: (tipo) => {
      set({ modalAberto: tipo });
    },

    escolherHex: (hexId) => {
      set({ hexDoSaqueador: hexId });
    },

    contrapor: (resposta) => {
      set({ contrapondo: resposta });
    },

    fechar: () => {
      set({ modalAberto: null, hexDoSaqueador: null, contrapondo: null });
    },
  }));
}

export function useStoreDaInterface<T>(
  store: StoreDaInterface,
  seletor: (s: EstadoDaInterface) => T,
): T {
  return useStore(store, seletor);
}
