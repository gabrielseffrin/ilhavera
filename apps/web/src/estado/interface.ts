/**
 * O que está aberto na tela — e nada mais.
 *
 * Separado do store da partida de propósito: isto não é estado de jogo. Não vem
 * do servidor na Fase 4, não entra em snapshot, não se reconstrói a partir do
 * estado. Misturar as duas coisas num store só faria o `state:patch` do
 * servidor decidir se um modal está aberto, que é exatamente o tipo de
 * acoplamento que a Fase 4 vai cobrar caro.
 *
 * `hexDoSaqueador` guarda o primeiro dos dois tempos do roubo: o hexágono é
 * escolhido no tabuleiro, a vítima no modal.
 */

import { create } from 'zustand';

import type { ActionType, HexId } from '@ilhavera/rules';

export type EstadoDaInterface = {
  /** Que grupo de jogadas está sendo escolhido, quando há mais de uma opção. */
  modalAberto: ActionType | null;
  /** Hexágono já escolhido para o Saqueador, aguardando a vítima. */
  hexDoSaqueador: HexId | null;

  abrirModal: (tipo: ActionType) => void;
  escolherHex: (hexId: HexId) => void;
  fechar: () => void;
};

export const useInterface = create<EstadoDaInterface>((set) => ({
  modalAberto: null,
  hexDoSaqueador: null,

  abrirModal: (tipo) => {
    set({ modalAberto: tipo });
  },

  escolherHex: (hexId) => {
    set({ hexDoSaqueador: hexId });
  },

  fechar: () => {
    set({ modalAberto: null, hexDoSaqueador: null });
  },
}));
