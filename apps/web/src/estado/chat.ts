/**
 * A conversa da sala, do lado do navegador.
 *
 * Store separado do da sala e do da partida pela mesma razão que aqueles dois
 * são separados um do outro: chat atravessa os dois — existe no lobby e continua
 * existindo durante a partida — e pendurá-lo em qualquer um deles obrigaria o
 * outro a conhecê-lo.
 *
 * **Não é singleton de módulo**, como nada em `estado/`: o aceite da Fase 4 monta
 * três telas no mesmo documento, e um store de módulo faria os três jogadores
 * dividirem a mesma caixa de mensagens — que é justamente o defeito que o teste
 * de chat precisa ser capaz de pegar.
 *
 * Nada aqui persiste. Quem chega depois não vê o que passou, e quem recarrega a
 * aba começa em branco: §7 não tem tabela de chat e o servidor não guarda nada.
 */

import { createStore, useStore, type StoreApi } from 'zustand';

import type { ServerEventPayload } from '@ilhavera/protocol';

import type { Conexao } from '../rede/conexao.js';

export type Mensagem = ServerEventPayload<'chat:message'> & {
  /**
   * Chave de renderização. `at` não serve: duas mensagens no mesmo milissegundo
   * são raras mas possíveis, e a colisão de chave no React embaralha a lista em
   * vez de dar erro.
   */
  id: string;
};

/**
 * Quantas mensagens ficam. Uma partida longa com gente conversando encheria a
 * memória da aba sem teto, e ninguém rola três horas de conversa para trás.
 */
export const MAX_MENSAGENS = 200;

export type EstadoDoChat = {
  mensagens: Mensagem[];
  /** Um envio em voo — para o campo não mandar a mesma frase duas vezes. */
  enviando: boolean;
  erro: string | null;

  enviar: (texto: string) => Promise<void>;
  limparErro: () => void;
};

export type StoreDoChat = StoreApi<EstadoDoChat>;

export function criarStoreDoChat(conexao: Conexao): StoreDoChat {
  let sequencia = 0;

  const store = createStore<EstadoDoChat>((set, get) => ({
    mensagens: [],
    enviando: false,
    erro: null,

    enviar: async (texto) => {
      const limpo = texto.trim();
      if (limpo.length === 0 || get().enviando) return;

      set({ enviando: true, erro: null });
      const ack = await conexao.enviar({ name: 'chat:send', payload: { text: limpo } });

      /**
       * **Sem eco otimista.** A mensagem entra na lista quando o servidor a
       * devolve por `chat:message`, e não quando o campo é enviado — mesma
       * escolha do `driverDeRede` para jogadas, pelo mesmo motivo: o servidor é
       * a autoridade, e uma linha que aparece e depois some porque a recusa
       * chegou é pior que uma linha que demora um piscar a aparecer.
       */
      set({ enviando: false, ...(ack.ok ? {} : { erro: ack.error }) });
    },

    limparErro: () => {
      set({ erro: null });
    },
  }));

  conexao.ao('chat:message', (dados) => {
    const mensagem: Mensagem = { ...dados, id: `${dados.playerId}:${++sequencia}` };
    const anteriores = store.getState().mensagens;
    store.setState({ mensagens: [...anteriores, mensagem].slice(-MAX_MENSAGENS) });
  });

  return store;
}

export function useStoreDoChat<T>(store: StoreDoChat, seletor: (s: EstadoDoChat) => T): T {
  return useStore(store, seletor);
}
