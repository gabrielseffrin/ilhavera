/**
 * O motor rodando dentro do navegador — modo hot-seat.
 *
 * É o mesmo pacote que o servidor usa: mesma `reduce`, mesma semente, mesmas
 * regras. É o que §6.1 chama de "o maior ganho arquitetural do projeto" — a
 * validação da interface não é uma reimplementação das regras em TypeScript, é
 * *as* regras.
 *
 * **Mesmo aqui a interface não vê o `GameState`.** O que sai daqui é
 * `ClientView`, produzido por `toClientView` — a mesma projeção que o servidor
 * emite. Duas consequências, e as duas importam: a mão alheia fica escondida de
 * graça (hot-seat é uma pessoa por vez no mesmo navegador, e "por vez" só
 * significa alguma coisa se o próximo não puder ler a mão do anterior na tela),
 * e a HUD nasceu escrita contra o formato que o socket entrega.
 *
 * Aqui, e só aqui, `enumerateLegalActions` roda no cliente: o `GameState` está
 * do lado. Em rede a lista vem do servidor, porque enumerar precisa do estado
 * cru — ver `driverDeRede.ts`.
 */

import {
  createGame,
  enumerateLegalActions,
  reduce,
  toClientView,
  type Action,
  type GameState,
  type PlayerColor,
  type PlayerId,
} from '@ilhavera/rules';

import { quemAge, type Driver, type Instantaneo, type Ouvintes } from './driver.js';

export type JogadorInicial = { id: PlayerId; name: string; color: PlayerColor };

export const JOGADORES_PADRAO: JogadorInicial[] = [
  { id: 'ana', name: 'Ana', color: 'red' },
  { id: 'bruno', name: 'Bruno', color: 'blue' },
  { id: 'carla', name: 'Carla', color: 'white' },
];

export type DriverLocal = Driver & {
  modo: 'hot-seat';
  /** O estado cru. Só o teste lê — nenhum componente tem como chegar aqui. */
  estado: () => GameState;
};

export function criarMotorLocal(seed = 'ilhavera'): DriverLocal {
  let jogo = novaPartida(seed);
  // No hot-seat toda jogada aceita é minha: quem está na cadeira sou eu.
  let aceitas = 0;
  const ouvintes = new Set<Ouvintes>();

  /**
   * Deriva tudo de uma vez.
   *
   * Não é otimização prematura: `toClientView` reprojeta o log inteiro e
   * recalcula os pontos de vitória de todos. Uma vez por jogada é barato; uma
   * vez por componente por render, com quatrocentos eventos no log, não é.
   */
  function derivar(): Instantaneo {
    // `GameState` também satisfaz `TurnScope`, então a cadeira passa de mão em
    // mão sem projetar o log só para descobrir de quem é a vez.
    const ativo = quemAge(jogo);
    return {
      mesa: toClientView(jogo, ativo),
      legais: ativo === null ? [] : enumerateLegalActions(jogo, ativo),
    };
  }

  function anunciar(): void {
    const instantaneo = derivar();
    for (const o of ouvintes) o.aoMudar(instantaneo);
  }

  return {
    modo: 'hot-seat',
    estado: () => jogo,
    minhasJogadas: () => aceitas,
    inicial: () => derivar(),

    assinar(o) {
      ouvintes.add(o);
      // Hot-seat não tem rede: está ligado desde sempre, e dizê-lo evita que a
      // casca fique esperando por uma conexão que não vai existir.
      o.aoMudarConexao('ligado');
      return () => ouvintes.delete(o);
    },

    executar(acao: Action) {
      const resultado = reduce(jogo, acao);

      // Jogada inválida é valor de retorno, nunca exceção — o contrato do motor
      // vale igual no navegador. A interface mostra e segue.
      if (!resultado.ok) {
        for (const o of ouvintes) o.aoErrar(resultado.error);
        return;
      }

      jogo = resultado.state;
      aceitas += 1;
      anunciar();
    },

    reiniciar(seed = String(Date.now())) {
      jogo = novaPartida(seed);
      aceitas += 1;
      anunciar();
    },
  };
}

function novaPartida(seed: string): GameState {
  return createGame({ id: 'hot-seat', seed, players: JOGADORES_PADRAO });
}
