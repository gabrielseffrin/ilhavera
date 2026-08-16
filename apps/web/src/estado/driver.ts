/**
 * De onde vem a partida.
 *
 * Duas implementações atendem a este contrato: o motor local, que roda o
 * `reduce` no próprio navegador (hot-seat, entrega da Fase 3), e o socket, que
 * pergunta ao servidor (Fase 4). Nada acima daqui sabe qual das duas está atrás
 * — é por isso que o tabuleiro, a HUD e os modais não mudaram uma linha quando
 * a fonte da verdade trocou de lugar.
 *
 * O hot-seat não é rascunho que sobrou: é como se desenvolve sem servidor, e é
 * o que o aceite da Fase 3 dirige. Continua sustentado.
 */

import {
  activePlayers,
  type Action,
  type ClientView,
  type PlayerId,
  type TurnScope,
} from '@ilhavera/rules';

import type { EstadoDaConexao } from '../rede/conexao.js';

export type Modo = 'hot-seat' | 'rede';

/** O que a interface precisa saber da partida, venha de onde vier. */
export type Instantaneo = {
  mesa: ClientView;
  legais: Action[];
  /**
   * Quando a mesa para de esperar — epoch em ms, ou `null` sem relógio.
   *
   * Fica **fora** de `mesa` porque não é estado de jogo: `ClientView` é a
   * projeção do motor puro, e o motor não pode saber que horas são (§4.1). O
   * prazo é do servidor e viaja no envelope do snapshot e do patch.
   *
   * No hot-seat é sempre `null` — não há relógio contra quem jogar.
   */
  prazo?: number | null;
};

export type Ouvintes = {
  aoMudar: (instantaneo: Instantaneo) => void;
  aoErrar: (codigo: string) => void;
  aoMudarConexao: (estado: EstadoDaConexao) => void;
};

export type Driver = {
  modo: Modo;
  /** O estado que já existe no momento em que a tela monta. `null` no lobby. */
  inicial: () => Instantaneo | null;
  assinar: (ouvintes: Ouvintes) => () => void;
  executar: (acao: Action) => void;
  /**
   * Quantas jogadas **deste cliente** foram aceitas.
   *
   * Serve aos modais, e a distinção só existe em rede: lá, a jogada de um
   * adversário anda a versão sem ter respondido nada que este jogador tenha
   * perguntado. Fechar o que está aberto a cada versão fecharia o compositor de
   * troca no meio da digitação, toda vez que alguém do outro lado jogasse.
   */
  minhasJogadas: () => number;
  /** Só o hot-seat sorteia outra partida; em rede isso é sair da sala. */
  reiniciar?: (seed?: string) => void;
  /**
   * Esquecer a mesa: não estou mais numa partida.
   *
   * Só a rede implementa, e é a contraparte de `reiniciar` — o comentário acima
   * já dizia que sair da sala é o equivalente em rede, mas faltava a metade que
   * apaga o que ficou. Sem isto a `ClientView` antiga sobrevive ao `room:leave`,
   * e a sala seguinte abre mostrando o tabuleiro da anterior até o primeiro
   * snapshot chegar.
   */
  limpar?: () => void;
};

/**
 * Quem a mesa está esperando.
 *
 * A mesma derivação nos dois modos, e é de propósito: `activePlayers` aceita
 * `TurnScope`, forma que `ClientView` satisfaz. A tentação era dizer "em rede,
 * `ativo` sou eu" — e isso quebraria duas coisas de uma vez: a faixa passaria a
 * dizer sempre o meu nome, e o painel de adversários deixaria de destacar de
 * quem a mesa está esperando.
 *
 * Quem responde "posso agir agora?" é `legais.length > 0`, que já cobre o
 * descarte paralelo: o devedor recebe lista sem ser o jogador da vez.
 */
export function quemAge(escopo: TurnScope): PlayerId | null {
  return activePlayers(escopo)[0] ?? null;
}
