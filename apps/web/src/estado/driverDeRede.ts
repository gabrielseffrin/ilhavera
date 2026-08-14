/**
 * A partida vindo do servidor.
 *
 * **Este arquivo não decide nada de regra.** Ele recebe estado e recebe a lista
 * de jogadas legais; não enumera, não valida, não deriva. Não é preguiça: é a
 * única forma correta. `isLegal` de `tradeConfirm` confere se o *parceiro* tem
 * os recursos, e é exatamente isso que `toClientView` apaga — um enumerador
 * deste lado responderia com menos informação do que a pergunta exige.
 *
 * O que ele faz de verdade são três coisas: remontar a projeção a partir do
 * patch, perceber quando perdeu um patch, e traduzir recusa em código de erro.
 */

import { applyClientViewPatch, type Action, type ClientView, type PlayerId } from '@ilhavera/rules';
import { toCommand, type PatchPayload, type SnapshotPayload } from '@ilhavera/protocol';

import type { Conexao } from '../rede/conexao.js';
import type { Driver, Instantaneo, Ouvintes } from './driver.js';

export type DriverDeRede = Driver & { modo: 'rede' };

export function criarDriverDeRede(conexao: Conexao): DriverDeRede {
  let mesa: ClientView | null = null;
  let legais: Action[] = [];
  let minhasJogadas = 0;
  const ouvintes = new Set<Ouvintes>();

  function anunciar(): void {
    if (mesa === null) return;
    const instantaneo: Instantaneo = { mesa, legais };
    for (const o of ouvintes) o.aoMudar(instantaneo);
  }

  function errar(codigo: string): void {
    for (const o of ouvintes) o.aoErrar(codigo);
  }

  conexao.ao('state:snapshot', (dados: SnapshotPayload) => {
    mesa = dados.view;
    legais = dados.legal;
    anunciar();
  });

  conexao.ao('state:patch', (dados: PatchPayload) => {
    if (mesa === null) return; // Ainda sem snapshot: o patch não tem em que se apoiar.

    // Repetido ou atrasado. Acontece na reconexão, quando o snapshot chega
    // primeiro e o buffer do socket entrega os patches antigos depois.
    if (dados.version <= mesa.version) return;

    /**
     * A regra de consistência de §5.2. Um salto quer dizer que um patch se
     * perdeu, e aplicar o seguinte por cima deixaria a tela contando uma
     * partida que não aconteceu — pior que não atualizar, porque parece certo.
     */
    if (dados.version > mesa.version + 1) {
      void pedirResync();
      return;
    }

    mesa = applyClientViewPatch(mesa, dados.view, dados.events);
    legais = dados.legal;
    anunciar();
  });

  async function pedirResync(): Promise<void> {
    // A resposta vem pelo ack **e** como `state:snapshot`; o ouvinte lá em cima
    // já trata o evento, então aqui só resta o que der errado.
    const ack = await conexao.enviar<SnapshotPayload>({ name: 'state:resync' });
    if (!ack.ok) errar(ack.error);
  }

  return {
    modo: 'rede',
    minhasJogadas: () => minhasJogadas,
    inicial: () => (mesa === null ? null : { mesa, legais }),

    assinar(o) {
      ouvintes.add(o);
      o.aoMudarConexao(conexao.estado());
      const desligar = conexao.aoMudarEstado((estado) => {
        o.aoMudarConexao(estado);
      });
      return () => {
        ouvintes.delete(o);
        desligar();
      };
    },

    /**
     * Manda e espera. **Sem atualização otimista**: o servidor é a autoridade
     * (§4.1), e adivinhar o resultado aqui traria de volta o motor no cliente
     * pela porta dos fundos — com o agravante de piscar a tela quando a
     * adivinhação divergisse.
     *
     * O ack é a resposta autoritativa, e é só nele que se escuta a recusa.
     * `game:error` traz a mesma informação e não é assinado de propósito: dois
     * caminhos para o mesmo alerta é o jogador ver duas vezes o que aconteceu
     * uma vez.
     */
    executar(acao: Action) {
      void (async () => {
        const ack = await conexao.enviar<{ version: number }>(toCommand(acao));
        if (ack.ok) {
          minhasJogadas += 1;
          anunciar();
        } else {
          errar(ack.error);
        }
      })();
    },
  };
}

/** Quem eu sou nesta mesa. `null` antes do primeiro snapshot. */
export function meuId(mesa: ClientView | null): PlayerId | null {
  return mesa?.you?.id ?? null;
}
