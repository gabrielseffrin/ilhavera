/**
 * O estado da partida no navegador — modo hot-seat.
 *
 * O motor roda aqui dentro, igualzinho ao do servidor: mesmo pacote, mesma
 * `reduce`, mesma semente. É o que §6.1 chama de "o maior ganho arquitetural do
 * projeto" — a validação da interface não é uma reimplementação das regras em
 * TypeScript, é *as* regras.
 *
 * Hot-seat significa uma pessoa por vez no mesmo navegador: o "jogador local" é
 * sempre quem precisa agir. Na Fase 4 isto vira um assinante de `state:snapshot`
 * e `state:patch`, e o `executar` passa a mandar comando pelo socket em vez de
 * chamar `reduce` — o resto da interface não muda, porque só conhece este store.
 */

import { create } from 'zustand';

import {
  createGame,
  enumerateLegalActions,
  reduce,
  type Action,
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
  jogo: GameState;
  /** Última recusa do motor, para a interface explicar em vez de só ignorar. */
  erro: ErrorCode | null;

  executar: (acao: Action) => void;
  reiniciar: (seed?: string) => void;
  limparErro: () => void;
};

/**
 * Quem precisa agir agora — nem sempre o jogador da vez.
 *
 * No descarte todos os pendentes agem em paralelo, e numa proposta de troca quem
 * responde é o alvo. Assumir "sempre o jogador da vez" deixaria a interface
 * travada na primeira rolagem de 7, que é o mesmo tropeço que o roteiro de
 * aceite do servidor precisou resolver.
 */
export function quemAge(jogo: GameState): PlayerId[] {
  if (jogo.phase === 'discarding') {
    const pendentes = Object.keys(jogo.pendingDiscards);
    if (pendentes.length > 0) return pendentes;
  }

  const troca = jogo.activeTrade;
  if (troca !== null) {
    const faltando = troca.targets.filter((alvo) => troca.responses[alvo] === undefined);
    if (faltando.length > 0) return faltando;
  }

  const daVez = jogo.players[jogo.currentPlayerIndex];
  return daVez === undefined ? [] : [daVez.id];
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

export const usePartida = create<EstadoDaPartida>((set, get) => ({
  jogo: novaPartida('ilhavera'),
  erro: null,

  executar: (acao) => {
    const resultado = reduce(get().jogo, acao);

    // Jogada inválida é valor de retorno, nunca exceção — o contrato do motor
    // vale igual no navegador. A interface mostra e segue.
    if (!resultado.ok) {
      set({ erro: resultado.error });
      return;
    }

    set({ jogo: resultado.state, erro: null });
  },

  reiniciar: (seed = String(Date.now())) => {
    set({ jogo: novaPartida(seed), erro: null });
  },

  limparErro: () => {
    set({ erro: null });
  },
}));
