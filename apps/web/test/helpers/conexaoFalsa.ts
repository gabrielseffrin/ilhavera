/**
 * Uma conexão de mentira: o socket sem o socket.
 *
 * Serve aos testes que querem exercitar o que o cliente **faz** com o que chega
 * — remontar o patch, pedir resync, mostrar a recusa — sem subir servidor. Os
 * testes que precisam do servidor de verdade são outros, e sobem um.
 */

import type { Ack, ServerEventName } from '@ilhavera/protocol';

import type { Conexao, EstadoDaConexao } from '../../src/rede/conexao.js';

export type ComandoEnviado = { name: string; payload?: Record<string, unknown> };

export type ConexaoFalsa = Conexao & {
  /** Empurra um evento do servidor, como se tivesse chegado pelo fio. */
  emitir: (evento: ServerEventName, dados: unknown) => void;
  enviados: ComandoEnviado[];
  /** O que o próximo `enviar` vai responder. */
  responder: (resposta: Ack<unknown>) => void;
  mudarEstado: (estado: EstadoDaConexao) => void;
};

export function conexaoFalsa(playerId = 'ana'): ConexaoFalsa {
  const ouvintes = new Map<string, ((dados: unknown) => void)[]>();
  const deEstado = new Set<(e: EstadoDaConexao) => void>();
  const enviados: ComandoEnviado[] = [];
  let proximaResposta: Ack<unknown> = { ok: true, data: { version: 0 } };
  let estado: EstadoDaConexao = 'ligado';

  const conexao: ConexaoFalsa = {
    enviados,
    playerId: () => playerId,
    estado: () => estado,
    socket: null as unknown as Conexao['socket'],
    fechar: () => undefined,

    responder(resposta) {
      proximaResposta = resposta;
    },

    mudarEstado(novo) {
      estado = novo;
      for (const ouvir of deEstado) ouvir(novo);
    },

    emitir(evento, dados) {
      for (const ouvir of ouvintes.get(evento) ?? []) ouvir(dados);
    },

    enviar: <T>(comando: { name: string; payload?: Record<string, unknown> }): Promise<Ack<T>> => {
      enviados.push(comando);
      return Promise.resolve(proximaResposta as Ack<T>);
    },

    ao: ((evento: string, ouvir: (dados: unknown) => void) => {
      const lista = ouvintes.get(evento) ?? [];
      lista.push(ouvir);
      ouvintes.set(evento, lista);
      return () => {
        ouvintes.set(
          evento,
          (ouvintes.get(evento) ?? []).filter((o) => o !== ouvir),
        );
      };
    }) as Conexao['ao'],

    aoMudarEstado(ouvir) {
      deEstado.add(ouvir);
      return () => deEstado.delete(ouvir);
    },
  };

  return conexao;
}
