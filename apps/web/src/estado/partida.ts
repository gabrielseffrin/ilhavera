/**
 * O estado da partida no navegador — modo hot-seat.
 *
 * O motor roda aqui dentro, igualzinho ao do servidor: mesmo pacote, mesma
 * `reduce`, mesma semente. É o que §6.1 chama de "o maior ganho arquitetural do
 * projeto" — a validação da interface não é uma reimplementação das regras em
 * TypeScript, é *as* regras.
 *
 * **A interface nunca vê o `GameState`.** Ela vê `mesa`, que é o `ClientView`
 * produzido por `toClientView` — a mesma projeção que o servidor emite em
 * `state:snapshot` (§4.5). Duas consequências, e as duas importam:
 *
 * - a mão alheia fica escondida de graça, inclusive qual recurso foi roubado.
 *   Hot-seat é uma pessoa por vez no mesmo navegador, e "por vez" só significa
 *   alguma coisa se o próximo não puder ler a mão do anterior olhando a tela;
 * - a HUD nasce escrita contra o formato que a Fase 4 vai entregar pelo socket.
 *   Naquele dia, `jogo` some daqui, `mesa` passa a vir do snapshot, `executar`
 *   manda comando em vez de chamar `reduce` — e nenhum componente muda.
 *
 * O que **não** atravessa de graça: `enumerateLegalActions` exige `GameState`.
 * Por isso `legais` é derivado aqui e só aqui — na Fase 4 esta única função
 * vira "o servidor manda a lista". Se a chamada vazar para dentro dos
 * componentes, o problema deixa de ser uma função e passa a ser dezenas de
 * arquivos.
 */

import { create } from 'zustand';

import {
  activePlayers,
  createGame,
  enumerateLegalActions,
  reduce,
  toClientView,
  type Action,
  type ClientView,
  type ErrorCode,
  type GameState,
  type PlayerColor,
  type PlayerId,
} from '@ilhavera/rules';

export type JogadorInicial = { id: PlayerId; name: string; color: PlayerColor };

export const JOGADORES_PADRAO: JogadorInicial[] = [
  { id: 'ana', name: 'Ana', color: 'red' },
  { id: 'bruno', name: 'Bruno', color: 'blue' },
  { id: 'carla', name: 'Carla', color: 'white' },
];

export type EstadoDaPartida = {
  /** Só existe no hot-seat: some quando o servidor virar a fonte da verdade. */
  jogo: GameState;
  /** O que a interface consome. Na Fase 4 vem do `state:snapshot`. */
  mesa: ClientView;
  /** Quem precisa agir agora — nem sempre o jogador da vez. */
  ativo: PlayerId | null;
  legais: Action[];
  /** Última recusa do motor, para a interface explicar em vez de só ignorar. */
  erro: ErrorCode | null;

  executar: (acao: Action) => void;
  reiniciar: (seed?: string) => void;
  limparErro: () => void;
};

/**
 * Quem precisa agir agora.
 *
 * Delega para `activePlayers` do motor: a mesma resposta que a CLI usa e que o
 * servidor precisa dar. No descarte todos os devedores agem em paralelo, e numa
 * proposta de troca quem responde é o alvo — assumir "sempre o jogador da vez"
 * travaria a interface na primeira rolagem de 7.
 */
export function quemAge(jogo: GameState): PlayerId[] {
  return activePlayers(jogo);
}

/** No hot-seat, o jogador local é o primeiro que precisa agir. */
export function jogadorAtivo(jogo: GameState): PlayerId | null {
  return quemAge(jogo)[0] ?? null;
}

/** As jogadas legais de quem está agindo — a fonte do destaque no tabuleiro. */
export function jogadasLegais(jogo: GameState): Action[] {
  const ativo = jogadorAtivo(jogo);
  return ativo === null ? [] : enumerateLegalActions(jogo, ativo);
}

function novaPartida(seed: string): GameState {
  return createGame({ id: 'hot-seat', seed, players: JOGADORES_PADRAO });
}

/**
 * Deriva tudo de uma vez, dentro do `set`.
 *
 * Não é otimização prematura: `toClientView` reprojeta o log inteiro e
 * recalcula os pontos de vitória de todos os jogadores. Uma vez por jogada é
 * barato; uma vez por componente por render, com quatrocentos eventos no log,
 * não é. E seletor do zustand que constrói objeto novo a cada chamada
 * re-renderiza sem parar.
 */
function derivar(jogo: GameState): Pick<EstadoDaPartida, 'jogo' | 'mesa' | 'ativo' | 'legais'> {
  const ativo = jogadorAtivo(jogo);
  return {
    jogo,
    ativo,
    mesa: toClientView(jogo, ativo),
    legais: ativo === null ? [] : enumerateLegalActions(jogo, ativo),
  };
}

export const usePartida = create<EstadoDaPartida>((set, get) => ({
  ...derivar(novaPartida('ilhavera')),
  erro: null,

  executar: (acao) => {
    const resultado = reduce(get().jogo, acao);

    // Jogada inválida é valor de retorno, nunca exceção — o contrato do motor
    // vale igual no navegador. A interface mostra e segue.
    if (!resultado.ok) {
      set({ erro: resultado.error });
      return;
    }

    set({ ...derivar(resultado.state), erro: null });
  },

  reiniciar: (seed = String(Date.now())) => {
    set({ ...derivar(novaPartida(seed)), erro: null });
  },

  limparErro: () => {
    set({ erro: null });
  },
}));
