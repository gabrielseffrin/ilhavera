/**
 * Os painéis de informação.
 *
 * A classe de bug vigiada aqui é a mais cara da fase: **mostrar na tela o que a
 * projeção escondeu.** `toClientView` filtra a mão alheia e as cartas de Ponto
 * de Vitória ocultas (§4.5), e não adianta nada se o painel recalcular o total
 * por conta própria — o vazamento voltaria pelo caminho mais curto, e sem
 * ninguém perceber, porque a tela continuaria bonita.
 *
 * O resto são os estados que uma partida típica não visita cedo: mão vazia,
 * carta comprada no turno, dado ainda não rolado, evento sem ator.
 */

import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createGame,
  toClientView,
  type ClientView,
  type GameEvent,
  type GameState,
} from '@ilhavera/rules';

import { Cronometro } from '../src/hud/Cronometro.js';
import { Dados } from '../src/hud/Dados.js';
import { LogDeEventos } from '../src/hud/LogDeEventos.js';
import { PainelDaMao } from '../src/hud/PainelDaMao.js';
import { FimDePartida } from '../src/hud/FimDePartida.js';
import { PainelDeAdversarios } from '../src/hud/PainelDeAdversarios.js';

function partida(): GameState {
  return createGame({
    id: 'paineis',
    seed: 'paineis',
    players: [
      { id: 'ana', name: 'Ana', color: 'red' },
      { id: 'bruno', name: 'Bruno', color: 'blue' },
      { id: 'carla', name: 'Carla', color: 'white' },
    ],
    shufflePlayerOrder: false,
  });
}

/** Um estado com mão, carta e construção montados à mão, e a projeção dele. */
function mesaDe(ajuste: (jogo: GameState) => GameState, espectador = 'ana'): ClientView {
  return toClientView(ajuste(partida()), espectador);
}

describe('PainelDaMao', () => {
  it('mostra os cinco recursos com a contagem de cada um', () => {
    const mesa = mesaDe((jogo) => ({
      ...jogo,
      players: jogo.players.map((p) =>
        p.id === 'ana'
          ? { ...p, resources: { lumber: 3, brick: 0, wool: 1, grain: 2, ore: 0 } }
          : p,
      ),
    }));

    render(<PainelDaMao voce={mesa.you} turno={mesa.turnNumber} />);
    const painel = screen.getByTestId('painel-da-mao');

    expect(painel.querySelector('[data-recurso="lumber"]')).toHaveAttribute('data-qtd', '3');
    expect(painel.querySelector('[data-recurso="brick"]')).toHaveAttribute('data-qtd', '0');
    expect(painel.querySelector('[data-recurso="grain"]')).toHaveAttribute('data-qtd', '2');
    expect(painel).toHaveTextContent('6 cartas');
  });

  it('marca a carta comprada neste turno como travada', () => {
    const mesa = mesaDe((jogo) => ({
      ...jogo,
      turnNumber: 7,
      players: jogo.players.map((p) =>
        p.id === 'ana'
          ? {
              ...p,
              devCards: [
                { card: 'knight' as const, boughtOnTurn: 7, played: false },
                { card: 'monopoly' as const, boughtOnTurn: 3, played: false },
              ],
            }
          : p,
      ),
    }));

    render(<PainelDaMao voce={mesa.you} turno={mesa.turnNumber} />);
    const painel = screen.getByTestId('painel-da-mao');

    expect(painel.querySelector('[data-carta="knight"]')).toHaveAttribute('data-travada', 'true');
    expect(painel.querySelector('[data-carta="monopoly"]')).toHaveAttribute(
      'data-travada',
      'false',
    );
    expect(painel).toHaveTextContent('comprada neste turno');
  });

  it('não mostra carta já jogada', () => {
    const mesa = mesaDe((jogo) => ({
      ...jogo,
      players: jogo.players.map((p) =>
        p.id === 'ana'
          ? { ...p, devCards: [{ card: 'knight' as const, boughtOnTurn: 1, played: true }] }
          : p,
      ),
    }));

    render(<PainelDaMao voce={mesa.you} turno={5} />);
    expect(screen.getByTestId('painel-da-mao').querySelector('[data-carta]')).toBeNull();
    expect(screen.getByTestId('painel-da-mao')).toHaveTextContent('nenhuma');
  });

  it('some para quem não tem mão — o espectador da Fase 4 já cabe', () => {
    render(<PainelDaMao voce={null} turno={1} />);
    expect(screen.queryByTestId('painel-da-mao')).not.toBeInTheDocument();
  });
});

describe('PainelDeAdversarios', () => {
  it('mostra pontuação PÚBLICA, sem a carta de Ponto de Vitória oculta', () => {
    const vertice = partida().board.vertexOrder[0] as string;

    const jogo = (base: GameState): GameState => ({
      ...base,
      buildings: { [vertice]: { owner: 'bruno', type: 'settlement' } },
      players: base.players.map((p) =>
        p.id === 'bruno'
          ? { ...p, devCards: [{ card: 'victoryPoint' as const, boughtOnTurn: 1, played: false }] }
          : p,
      ),
    });

    // Ana olhando: só pode ver o ponto do assentamento de Bruno.
    const mesa = toClientView(jogo(partida()), 'ana');
    render(<PainelDeAdversarios mesa={mesa} ativo="ana" />);

    const linha = screen
      .getByTestId('painel-de-adversarios')
      .querySelector('[data-jogador="bruno"]');
    expect(linha).toHaveAttribute('data-pv', '1');
    expect(linha).toHaveTextContent('1 PV');
  });

  it('mostra só a contagem da mão alheia, nunca os recursos', () => {
    const mesa = mesaDe((jogo) => ({
      ...jogo,
      players: jogo.players.map((p) =>
        p.id === 'carla'
          ? { ...p, resources: { lumber: 4, brick: 0, wool: 0, grain: 1, ore: 0 } }
          : p,
      ),
    }));

    const carla = mesa.players.find((p) => p.id === 'carla');
    expect(carla).toBeDefined();
    expect(carla).not.toHaveProperty('resources');
    expect(carla?.resourceCount).toBe(5);

    render(<PainelDeAdversarios mesa={mesa} ativo="ana" />);
    const linha = screen
      .getByTestId('painel-de-adversarios')
      .querySelector('[data-jogador="carla"]');
    expect(linha).toHaveTextContent('5');
    expect(linha).not.toHaveTextContent('Madeira');
  });

  it('põe os selos de bônus só no dono', () => {
    const mesa = mesaDe((jogo) => ({
      ...jogo,
      longestRoad: { owner: 'bruno', length: 6 },
      largestArmy: { owner: 'carla', size: 3 },
    }));

    render(<PainelDeAdversarios mesa={mesa} ativo="ana" />);
    const painel = screen.getByTestId('painel-de-adversarios');

    const bruno = painel.querySelector('[data-jogador="bruno"]') as HTMLElement;
    const carla = painel.querySelector('[data-jogador="carla"]') as HTMLElement;
    const ana = painel.querySelector('[data-jogador="ana"]') as HTMLElement;

    expect(within(bruno).getByText('Estrada')).toBeInTheDocument();
    expect(within(carla).getByText('Exército')).toBeInTheDocument();
    expect(within(ana).queryByText('Estrada')).not.toBeInTheDocument();
    expect(within(ana).queryByText('Exército')).not.toBeInTheDocument();
  });

  it('avisa quem está devendo descarte', () => {
    const mesa = mesaDe((jogo) => ({
      ...jogo,
      phase: 'discarding' as const,
      pendingDiscards: { bruno: 4 },
    }));

    render(<PainelDeAdversarios mesa={mesa} ativo="bruno" />);
    const painel = screen.getByTestId('painel-de-adversarios');

    expect(painel.querySelector('[data-jogador="bruno"]')).toHaveTextContent('descartando 4');
    expect(painel.querySelector('[data-jogador="ana"]')).not.toHaveTextContent('descartando');
  });
});

describe('Dados', () => {
  it('mostra o vazio em vez de sumir quando ainda não se rolou', () => {
    render(<Dados roll={null} chave={0} />);
    const dados = screen.getByTestId('dados');

    expect(dados).toBeInTheDocument();
    expect(dados).toHaveAttribute('data-total', '');
    expect(dados).toHaveTextContent('ainda não rolou');
  });

  it('desenha as duas faces e o total', () => {
    render(<Dados roll={{ dice: [3, 5], total: 8 }} chave={1} />);
    const dados = screen.getByTestId('dados');

    expect(dados).toHaveAttribute('data-total', '8');
    expect(within(dados).getByLabelText('dado 3')).toBeInTheDocument();
    expect(within(dados).getByLabelText('dado 5')).toBeInTheDocument();
    // Pontos, não algarismo: 3 + 5 círculos.
    expect(dados.querySelectorAll('circle')).toHaveLength(8);
  });
});

describe('LogDeEventos', () => {
  it('narra uma linha por evento, na ordem em que aconteceram', () => {
    const mesa = mesaDe((jogo) => jogo);
    render(<LogDeEventos mesa={mesa} />);

    const linhas = screen.getByTestId('log').querySelectorAll('li');
    expect(linhas).toHaveLength(mesa.log.length);
    expect(linhas[0]).toHaveAttribute('data-evento', 'gameStarted');
    for (const linha of linhas) expect(linha.textContent).not.toContain('undefined');
  });

  it('não põe bolinha de ator em evento que não tem ator', () => {
    const producao: GameEvent = {
      type: 'resourcesProduced',
      data: { gains: {}, blockedByBank: [] },
    };
    const mesa = mesaDe((jogo) => ({ ...jogo, log: [...jogo.log, producao] }));

    render(<LogDeEventos mesa={mesa} />);
    const linhas = screen.getByTestId('log').querySelectorAll('li');
    const ultima = linhas[linhas.length - 1] as HTMLElement;

    expect(ultima).toHaveAttribute('data-evento', 'resourcesProduced');
    expect(ultima.querySelector('[data-ator]')).toBeNull();
    expect(ultima.textContent).not.toContain('undefined');
  });

  it('pinta a bolinha do ator quando há um', () => {
    const mesa = mesaDe((jogo) => ({
      ...jogo,
      log: [
        ...jogo.log,
        { type: 'devCardBought', actor: 'bruno', data: { deckLeft: 20 } } satisfies GameEvent,
      ],
    }));

    render(<LogDeEventos mesa={mesa} />);
    const linhas = screen.getByTestId('log').querySelectorAll('li');
    const ultima = linhas[linhas.length - 1] as HTMLElement;

    expect(ultima.querySelector('[data-ator]')).toHaveAttribute('data-ator', 'bruno');
  });

  it('não mexe no log que recebeu', () => {
    const mesa = mesaDe((jogo) => jogo);
    const copia = [...mesa.log];

    render(<LogDeEventos mesa={mesa} />);
    // `reverse()` para mostrar de trás para frente mutaria o estado projetado —
    // e, na Fase 4, o snapshot vindo do servidor.
    expect(mesa.log).toEqual(copia);
  });

  it('corta pelo limite, mantendo os mais recentes', () => {
    const extras: GameEvent[] = Array.from({ length: 10 }, (_, i) => ({
      type: 'turnEnded',
      actor: 'ana',
      data: { nextPlayer: 'bruno', turnNumber: i + 2 },
    }));
    const mesa = mesaDe((jogo) => ({ ...jogo, log: [...jogo.log, ...extras] }));

    render(<LogDeEventos mesa={mesa} limite={3} />);
    const linhas = screen.getByTestId('log').querySelectorAll('li');

    expect(linhas).toHaveLength(3);
    expect(linhas[2]).toHaveTextContent('Turno 11');
  });
});

/**
 * O placar final é o único painel que mostra o que a partida escondeu. O que se
 * vigia aqui é o par: que ele **não** aparece antes da hora, e que quando
 * aparece some do lado do motor — nenhum número desta tabela é somado aqui.
 */
describe('FimDePartida', () => {
  /** Bruno com duas cartas de PV: os pontos que só o fim revela. */
  function comPVOculto(jogo: GameState): GameState {
    return {
      ...jogo,
      players: jogo.players.map((p) =>
        p.id === 'bruno'
          ? {
              ...p,
              devCards: [
                { card: 'victoryPoint' as const, boughtOnTurn: 1, played: false },
                { card: 'victoryPoint' as const, boughtOnTurn: 2, played: false },
              ],
            }
          : p,
      ),
    };
  }

  it('não desenha nada enquanto a partida está em curso', () => {
    const mesa = mesaDe(comPVOculto);

    render(<FimDePartida mesa={mesa} />);

    expect(mesa.finalScores).toBeNull();
    expect(screen.queryByTestId('fim-de-partida')).not.toBeInTheDocument();
  });

  it('anuncia o vencedor e abre a decomposição de todos os jogadores', () => {
    const mesa = mesaDe((jogo) => ({
      ...comPVOculto(jogo),
      winner: 'bruno',
      phase: 'finished' as const,
    }));

    render(<FimDePartida mesa={mesa} />);
    const painel = screen.getByTestId('fim-de-partida');

    expect(painel).toHaveAttribute('data-vencedor', 'bruno');
    expect(painel).toHaveTextContent('Bruno venceu com');
    // Uma linha por jogador, e o total de cada uma vem de `finalScores`.
    for (const p of mesa.players) {
      const linha = painel.querySelector(`[data-jogador="${p.id}"]`);
      expect(linha).toHaveAttribute('data-total', String(mesa.finalScores?.[p.id]?.total));
    }
  });

  it('mostra as cartas de PV que estavam ocultas — e só depois do fim', () => {
    const emCurso = mesaDe(comPVOculto);
    const acabou = mesaDe((jogo) => ({
      ...comPVOculto(jogo),
      winner: 'bruno',
      phase: 'finished' as const,
    }));

    // Durante a partida, Ana enxergava um Bruno com dois pontos a menos.
    const publico = emCurso.players.find((p) => p.id === 'bruno')!.victoryPointsPublic;
    expect(acabou.finalScores?.['bruno']?.devCards).toBe(2);
    expect(acabou.finalScores?.['bruno']?.total).toBe(publico + 2);
  });

  it('classifica do maior para o menor, e não pela ordem dos assentos', () => {
    const mesa = mesaDe((jogo) => ({
      ...comPVOculto(jogo),
      winner: 'bruno',
      phase: 'finished' as const,
    }));

    render(<FimDePartida mesa={mesa} />);
    const linhas = [...screen.getByTestId('fim-de-partida').querySelectorAll('tbody tr')];
    const totais = linhas.map((l) => Number(l.getAttribute('data-total')));

    expect(totais).toEqual([...totais].sort((a, b) => b - a));
    expect(linhas[0]).toHaveAttribute('data-jogador', 'bruno');
  });
});

/**
 * O cronômetro.
 *
 * O que importa aqui é a subtração ser feita **no cliente, contra o instante que
 * o servidor mandou**. Um componente que recebesse "faltam 40s" e decrementasse
 * pareceria igual na tela e divergiria a cada atraso de rede.
 */
describe('Cronometro', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('não desenha nada quando a sala não tem relógio', () => {
    render(<Cronometro prazo={null} />);
    expect(screen.queryByTestId('cronometro')).not.toBeInTheDocument();
  });

  it('mostra o restante calculado a partir do instante recebido', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    render(<Cronometro prazo={1_700_000_000_000 + 45_000} />);

    expect(screen.getByTestId('cronometro')).toHaveAttribute('data-restante', '45');
  });

  it('anda com o relógio, sem decrementar um número guardado', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    render(<Cronometro prazo={1_700_000_000_000 + 45_000} />);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    // 15, e não "45 menos os tiques que eu vi": o cálculo é sempre contra o
    // relógio, então perder um tique não acumula erro.
    expect(screen.getByTestId('cronometro')).toHaveAttribute('data-restante', '15');
  });

  it('não conta abaixo de zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    render(<Cronometro prazo={1_700_000_000_000 - 5_000} />);

    expect(screen.getByTestId('cronometro')).toHaveAttribute('data-restante', '0');
  });

  it('não se anuncia a cada segundo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    render(<Cronometro prazo={1_700_000_000_000 + 45_000} />);

    // Um contador em `aria-live` deixa o leitor de tela inútil pelo resto do
    // turno. Quem quiser saber consulta.
    expect(screen.getByTestId('cronometro')).toHaveAttribute('aria-live', 'off');
    expect(screen.getByTestId('cronometro')).toHaveAttribute('role', 'timer');
  });
});
