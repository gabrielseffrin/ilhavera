/**
 * Os modais.
 *
 * Duas classes de bug vigiadas aqui.
 *
 * A primeira é oferecer o que o motor recusaria. Monopólio, Descoberta,
 * comércio com o banco e a vítima do roubo saem todos da lista de jogadas
 * legais — se algum deles passar a montar as opções por conta própria (iterar
 * os cinco recursos, deduzir quem tem carta para roubar), a interface volta a
 * ter uma segunda opinião sobre as regras, e a tese da fase cai.
 *
 * A segunda é do descarte, e é sutil: no 7, vários jogadores devem cartas ao
 * mesmo tempo. O dono do modal muda quando o anterior resolve a pendência, e
 * sem `key` por jogador o React reaproveita a instância — a seleção de quem já
 * descartou aparece na tela do próximo, contando o que ele não devia saber.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  createGame,
  enumerateLegalActions,
  isLegal,
  toClientView,
  type Action,
  type ClientView,
  type GameState,
  type RESOURCES,
} from '@ilhavera/rules';

import { Modais } from '../src/hud/Modais.js';

function partida(): GameState {
  return createGame({
    id: 'modais',
    seed: 'modais',
    players: [
      { id: 'ana', name: 'Ana', color: 'red' },
      { id: 'bruno', name: 'Bruno', color: 'blue' },
      { id: 'carla', name: 'Carla', color: 'white' },
    ],
    shufflePlayerOrder: false,
  });
}

function montar(
  ajuste: (jogo: GameState) => GameState,
  espectador: string,
  extras: {
    modalAberto?: Action['type'] | null;
    hexDoSaqueador?: string | null;
    aoEscolher?: (a: Action) => void;
  } = {},
): { jogo: GameState; mesa: ClientView; legais: Action[]; aoEscolher: (a: Action) => void } {
  const jogo = ajuste(partida());
  const mesa = toClientView(jogo, espectador);
  const legais = enumerateLegalActions(jogo, espectador);
  const aoEscolher = extras.aoEscolher ?? vi.fn();

  render(
    <Modais
      mesa={mesa}
      legais={legais}
      modalAberto={extras.modalAberto ?? null}
      hexDoSaqueador={extras.hexDoSaqueador ?? null}
      aoEscolher={aoEscolher}
      aoFechar={vi.fn()}
    />,
  );

  return { jogo, mesa, legais, aoEscolher };
}

/** Um estado de fase principal com mão farta, para os modais voluntários. */
function naFasePrincipal(mao: Partial<Record<(typeof RESOURCES)[number], number>>) {
  return (jogo: GameState): GameState => ({
    ...jogo,
    phase: 'main',
    turnNumber: 5,
    players: jogo.players.map((p) =>
      p.id === 'ana'
        ? {
            ...p,
            resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0, ...mao },
            devCards: [
              { card: 'monopoly' as const, boughtOnTurn: 1, played: false },
              { card: 'yearOfPlenty' as const, boughtOnTurn: 1, played: false },
            ],
          }
        : p,
    ),
  });
}

describe('modal de descarte', () => {
  const devendo = (jogo: GameState): GameState => ({
    ...jogo,
    phase: 'discarding',
    pendingDiscards: { ana: 4, bruno: 3 },
    players: jogo.players.map((p) =>
      p.id === 'ana'
        ? { ...p, resources: { lumber: 5, brick: 2, wool: 1, grain: 0, ore: 0 } }
        : { ...p, resources: { lumber: 3, brick: 3, wool: 1, grain: 0, ore: 0 } },
    ),
  });

  it('não deixa confirmar antes de a soma bater', async () => {
    montar(devendo, 'ana');

    const modal = screen.getByTestId('modal');
    expect(modal).toHaveAttribute('data-modal', 'descarte');

    const descartar = within(modal).getByRole('button', { name: 'Descartar' });
    expect(descartar).toBeDisabled();
    expect(screen.getByTestId('contador-descarte')).toHaveTextContent('0 de 4');

    for (let i = 0; i < 4; i++) {
      await userEvent.click(within(modal).getByRole('button', { name: 'mais Madeira' }));
    }

    expect(screen.getByTestId('contador-descarte')).toHaveTextContent('4 de 4');
    expect(descartar).toBeEnabled();
  });

  it('não deixa escolher mais do que se tem', async () => {
    montar(devendo, 'ana');
    const modal = screen.getByTestId('modal');

    // Ana tem 1 de Lã: o segundo clique não pode subir para 2.
    const mais = within(modal).getByRole('button', { name: 'mais Lã' });
    await userEvent.click(mais);
    expect(modal.querySelector('[data-descarte="wool"] [data-qtd]')).toHaveAttribute(
      'data-qtd',
      '1',
    );
    expect(mais).toBeDisabled();
  });

  it('manda ao motor exatamente o que foi escolhido', async () => {
    const aoEscolher = vi.fn();
    montar(devendo, 'ana', { aoEscolher });
    const modal = screen.getByTestId('modal');

    for (let i = 0; i < 3; i++) {
      await userEvent.click(within(modal).getByRole('button', { name: 'mais Madeira' }));
    }
    await userEvent.click(within(modal).getByRole('button', { name: 'mais Tijolo' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Descartar' }));

    expect(aoEscolher).toHaveBeenCalledWith({
      type: 'discard',
      player: 'ana',
      resources: { lumber: 3, brick: 1, wool: 0, grain: 0, ore: 0 },
    });
  });

  it('o descarte automático despacha uma jogada que o motor aceita', async () => {
    const aoEscolher = vi.fn();
    const { jogo } = montar(devendo, 'ana', { aoEscolher });

    await userEvent.click(screen.getByRole('button', { name: 'Descartar automático' }));

    const acao = aoEscolher.mock.calls[0]?.[0] as Action;
    expect(acao.type).toBe('discard');
    expect(isLegal(jogo, acao)).toBe(true);
  });

  it('é obrigatório: não oferece saída', () => {
    montar(devendo, 'ana');
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('mostra a mão de cada devedor separadamente', () => {
    const { unmount } = render(<div />);
    unmount();

    montar(devendo, 'bruno');
    const modal = screen.getByTestId('modal');

    // Bruno deve 3, não os 4 de Ana — o total sai de `pendingDiscards`.
    expect(within(modal).getByTestId('contador-descarte')).toHaveTextContent('0 de 3');
    expect(modal).toHaveTextContent('Bruno');
  });
});

describe('modal do roubo', () => {
  const comSaqueador = (jogo: GameState): GameState => {
    const vertices = jogo.board.hexOrder
      .filter((h) => h !== jogo.robberHex)
      .map((h) => ({ hexId: h, vertices: jogo.board.hexes[h]?.vertices ?? [] }))
      .find((h) => h.vertices.length >= 2);
    if (vertices === undefined) throw new Error('tabuleiro sem hexágono');

    return {
      ...jogo,
      phase: 'movingRobber',
      turnNumber: 5,
      // Dois vizinhos com carta na mão: é o que gera mais de um alvo.
      buildings: {
        [vertices.vertices[0] as string]: { owner: 'bruno', type: 'settlement' },
        [vertices.vertices[1] as string]: { owner: 'carla', type: 'settlement' },
      },
      players: jogo.players.map((p) =>
        p.id === 'ana'
          ? p
          : { ...p, resources: { lumber: 2, brick: 0, wool: 0, grain: 0, ore: 0 } },
      ),
    };
  };

  it('lista uma opção por alvo que o motor enumerou, e nem uma a mais', () => {
    const jogo = comSaqueador(partida());
    const legais = enumerateLegalActions(jogo, 'ana');
    const hex = legais.find((a) => a.type === 'moveRobber' && a.stealFrom !== null);
    if (hex === undefined || hex.type !== 'moveRobber') throw new Error('nenhum roubo possível');

    montar(comSaqueador, 'ana', { hexDoSaqueador: hex.hexId });

    const modal = screen.getByTestId('modal');
    expect(modal).toHaveAttribute('data-modal', 'roubo');

    const doMotor = legais.filter((a) => a.type === 'moveRobber' && a.hexId === hex.hexId);
    expect(modal.querySelectorAll('[data-opcao]')).toHaveLength(doMotor.length);
  });

  it('é obrigatório: escolhido o hexágono, não há como desistir', () => {
    const jogo = comSaqueador(partida());
    const primeiro = enumerateLegalActions(jogo, 'ana').find((a) => a.type === 'moveRobber');
    if (primeiro === undefined || primeiro.type !== 'moveRobber') throw new Error('sem opção');

    montar(comSaqueador, 'ana', { hexDoSaqueador: primeiro.hexId });
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });
});

describe('modais dirigidos pela lista de legais', () => {
  it('o Monopólio oferece exatamente os recursos que o motor enumerou', () => {
    const { legais } = montar(naFasePrincipal({}), 'ana', { modalAberto: 'playMonopoly' });

    const modal = screen.getByTestId('modal');
    const doMotor = legais.filter((a) => a.type === 'playMonopoly');

    expect(doMotor.length).toBe(5);
    expect(modal.querySelectorAll('[data-opcao]')).toHaveLength(doMotor.length);
  });

  it('a Descoberta oferece os pares do motor, duplos inclusive', () => {
    const { legais } = montar(naFasePrincipal({}), 'ana', { modalAberto: 'playYearOfPlenty' });

    const doMotor = legais.filter((a) => a.type === 'playYearOfPlenty');
    expect(screen.getByTestId('modal').querySelectorAll('[data-opcao]')).toHaveLength(
      doMotor.length,
    );

    // Par duplo existe e é legítimo: pegar dois do mesmo recurso.
    expect(
      doMotor.some((a) => a.type === 'playYearOfPlenty' && a.resources[0] === a.resources[1]),
    ).toBe(true);
  });

  it('o comércio com o banco mostra a taxa, que não está na ação', () => {
    montar(naFasePrincipal({ lumber: 6 }), 'ana', { modalAberto: 'tradeBank' });

    const modal = screen.getByTestId('modal');
    const botoes = [...modal.querySelectorAll('[data-opcao]')];

    expect(botoes.length).toBeGreaterThan(0);
    // Sem porto, a taxa é 4:1 — e dois botões idênticos custando 4 e 2 cartas
    // seriam indistinguíveis sem isto.
    expect(botoes[0]?.textContent).toContain('4×');
    expect(botoes[0]?.textContent).toContain('Madeira');
  });

  it('despacha a ação escolhida, tal como veio do motor', async () => {
    const aoEscolher = vi.fn();
    const { legais } = montar(naFasePrincipal({}), 'ana', {
      modalAberto: 'playMonopoly',
      aoEscolher,
    });

    await userEvent.click(
      screen.getByTestId('modal').querySelectorAll('[data-opcao]')[0] as Element,
    );

    expect(aoEscolher).toHaveBeenCalledWith(legais.find((a) => a.type === 'playMonopoly'));
  });

  it('são dispensáveis: dá para cancelar', () => {
    montar(naFasePrincipal({}), 'ana', { modalAberto: 'playMonopoly' });
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('Escape fecha o dispensável e não fecha o obrigatório', async () => {
    const fechar = vi.fn();
    const jogo = naFasePrincipal({})(partida());

    render(
      <Modais
        mesa={toClientView(jogo, 'ana')}
        legais={enumerateLegalActions(jogo, 'ana')}
        modalAberto="playMonopoly"
        hexDoSaqueador={null}
        aoEscolher={vi.fn()}
        aoFechar={fechar}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(fechar).toHaveBeenCalled();

    // O descarte não escuta a tecla: sair dele deixaria a partida travada com
    // uma pendência que o motor não perdoa.
    const semSaida = vi.fn();
    montar(
      (base) => ({
        ...base,
        phase: 'discarding',
        pendingDiscards: { ana: 2 },
        players: base.players.map((p) =>
          p.id === 'ana'
            ? { ...p, resources: { lumber: 4, brick: 0, wool: 0, grain: 0, ore: 0 } }
            : p,
        ),
      }),
      'ana',
      { aoEscolher: semSaida },
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.getAllByTestId('modal').at(-1)).toHaveAttribute('data-modal', 'descarte');
  });

  it('não abre nada quando o grupo pedido ficou sem opção legal', () => {
    montar(naFasePrincipal({}), 'ana', { modalAberto: 'tradeBank' });
    // Mão vazia: nenhum par de troca é bancável.
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('o descarte passa na frente de qualquer modal voluntário', () => {
    montar(
      (jogo) => ({
        ...jogo,
        phase: 'discarding',
        pendingDiscards: { ana: 2 },
        players: jogo.players.map((p) =>
          p.id === 'ana'
            ? { ...p, resources: { lumber: 4, brick: 0, wool: 0, grain: 0, ore: 0 } }
            : p,
        ),
      }),
      'ana',
      { modalAberto: 'playMonopoly' },
    );

    expect(screen.getByTestId('modal')).toHaveAttribute('data-modal', 'descarte');
  });
});
