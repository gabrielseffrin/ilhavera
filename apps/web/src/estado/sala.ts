/**
 * A sala — o lobby do lado do navegador.
 *
 * Separado do store da partida porque são coisas diferentes, e o ADR-003 já
 * separou do outro lado: uma sala esperando jogadores não é uma partida. Aqui
 * mora `RoomView`, que o servidor emite em `room:updated`; lá mora `ClientView`,
 * que só existe depois do `room:start`.
 *
 * Não há sala no hot-seat: `criarStoreDaSala` só é chamado com conexão.
 */

import { createStore, useStore, type StoreApi } from 'zustand';

import type { PlayerColor } from '@ilhavera/rules';
import type { RoomSettings, RoomView } from '@ilhavera/protocol';

import type { Conexao } from '../rede/conexao.js';

export const CHAVE_DO_APELIDO = 'ilhavera:apelido';

export type EstadoDaSala = {
  sala: RoomView | null;
  /** Guardado entre visitas: ninguém quer redigitar o apelido a cada partida. */
  apelido: string;
  erro: string | null;
  /** Um comando de sala em voo — para a tela não deixar clicar duas vezes. */
  ocupado: boolean;

  definirApelido: (apelido: string) => void;
  /** `settings` parcial: o zod do contrato completa o que faltar. */
  criar: (settings?: Partial<RoomSettings>) => Promise<void>;
  entrar: (codigo: string) => Promise<void>;
  escolherCor: (cor: PlayerColor) => Promise<void>;
  iniciar: () => Promise<void>;
  sair: () => Promise<void>;
  limparErro: () => void;
};

export type StoreDaSala = StoreApi<EstadoDaSala>;

export type OpcoesDaSala = {
  conexao: Conexao;
  /** Injetável para o teste: sem isto, N clientes dividiriam o mesmo apelido. */
  lerApelido?: () => string;
  gravarApelido?: (apelido: string) => void;
};

export function criarStoreDaSala({
  conexao,
  lerApelido = apelidoGuardado,
  gravarApelido = guardarApelido,
}: OpcoesDaSala): StoreDaSala {
  const store = createStore<EstadoDaSala>((set, get) => {
    /**
     * Todo comando de sala segue o mesmo caminho: trava, manda, e ou guarda a
     * `RoomView` do ack ou guarda o erro. O ack é a resposta autoritativa — a
     * sala também chega por `room:updated`, mas quem errou o código precisa
     * saber disso, e broadcast não avisa quem não entrou.
     */
    async function mandar(
      name: Parameters<Conexao['enviar']>[0]['name'],
      payload?: Record<string, unknown>,
    ): Promise<RoomView | null> {
      if (get().ocupado) return null;
      set({ ocupado: true, erro: null });

      const ack = await conexao.enviar<RoomView>({
        name,
        ...(payload === undefined ? {} : { payload }),
      });

      if (!ack.ok) {
        set({ ocupado: false, erro: ack.error });
        return null;
      }

      set({ ocupado: false, sala: ack.data });
      return ack.data;
    }

    return {
      sala: null,
      apelido: lerApelido(),
      erro: null,
      ocupado: false,

      definirApelido: (apelido) => {
        set({ apelido });
        gravarApelido(apelido);
      },

      criar: async (settings) => {
        await mandar('room:create', {
          nickname: get().apelido.trim(),
          ...(settings === undefined ? {} : { settings }),
        });
      },

      entrar: async (codigo) => {
        await mandar('room:join', { code: codigo.trim(), nickname: get().apelido.trim() });
      },

      escolherCor: async (cor) => {
        await mandar('room:setColor', { color: cor });
      },

      iniciar: async () => {
        await mandar('room:start');
      },

      sair: async () => {
        if (get().ocupado) return;
        set({ ocupado: true, erro: null });
        const ack = await conexao.enviar({ name: 'room:leave' });
        set({ ocupado: false, sala: null, ...(ack.ok ? {} : { erro: ack.error }) });
      },

      limparErro: () => {
        set({ erro: null });
      },
    };
  });

  // O broadcast mantém a lista viva: quem entra, quem troca de cor, quem cai.
  conexao.ao('room:updated', (sala: RoomView) => {
    store.setState({ sala });
  });

  return store;
}

export function useStoreDaSala<T>(store: StoreDaSala, seletor: (s: EstadoDaSala) => T): T {
  return useStore(store, seletor);
}

function apelidoGuardado(): string {
  try {
    return globalThis.localStorage.getItem(CHAVE_DO_APELIDO) ?? '';
  } catch {
    return '';
  }
}

function guardarApelido(apelido: string): void {
  try {
    globalThis.localStorage.setItem(CHAVE_DO_APELIDO, apelido);
  } catch {
    // Sem `localStorage` o apelido não sobrevive à aba. Não é motivo para
    // impedir alguém de jogar.
  }
}
