/**
 * Comércio entre jogadores: propor, responder, contrapor, fechar.
 *
 * O fluxo mais longo do protocolo, e o único em que a interface monta a jogada
 * em vez de escolhê-la de uma lista. Por isso o que se vigia aqui é a fronteira:
 *
 * - a **sonda** de `tradeOffer` que o servidor manda para dizer "dá para propor"
 *   nunca pode ser despachada como jogada. É uma proposta que o jogador não
 *   escolheu, e mandá-la à mesa seria a interface negociando sozinha;
 * - aceitar, recusar e fechar saem da lista de legais, não de uma condição
 *   reescrita aqui;
 * - a contraproposta é a exceção consciente: o motor a aceita e nunca a enumera,
 *   então o botão aparece quando *responder* é legal, e os termos vêm do
 *   compositor.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  createGame,
  emptyResourceCount,
  enumerateLegalActions,
  toClientView,
  type Action,
  type ActionOf,
  type GameState,
  type ResourceCount,
  type TradeTerms,
} from '@ilhavera/rules';

import { BarraDeAcoes } from '../src/hud/BarraDeAcoes.js';
import { Modais } from '../src/hud/Modais.js';
import { PainelDaProposta } from '../src/hud/PainelDaProposta.js';

const MAO = { lumber: 3, brick: 2, wool: 1, grain: 0, ore: 0 };

function partida(): GameState {
  return createGame({
    id: 'troca',
    seed: 'troca',
    players: [
      { id: 'ana', name: 'Ana', color: 'red' },
      { id: 'bruno', name: 'Bruno', color: 'blue' },
      { id: 'carla', name: 'Carla', color: 'white' },
    ],
    shufflePlayerOrder: false,
  });
}

function conta(parcial: Partial<ResourceCount>): ResourceCount {
  return { ...emptyResourceCount(), ...parcial };
}

/** Fase principal, com Ana na vez e uma mão que dá para negociar. */
function naVez(jogo: GameState): GameState {
  return {
    ...jogo,
    phase: 'main',
    turnNumber: 5,
    players: jogo.players.map((p) =>
      p.id === 'ana' ? { ...p, resources: conta(MAO) } : { ...p, resources: conta({ ore: 2 }) },
    ),
  };
}

const TERMOS: TradeTerms = {
  give: conta({ lumber: 2 }),
  receive: conta({ ore: 1 }),
};

function comProposta(jogo: GameState, respostas: Record<string, unknown> = {}): GameState {
  return {
    ...naVez(jogo),
    tradeSeq: 1,
    activeTrade: {
      id: 't5-1',
      proposer: 'ana',
      terms: TERMOS,
      targets: ['bruno', 'carla'],
      responses: respostas as never,
    },
  };
}

/** Como o servidor monta a lista: as legais mais a sonda de proposta. */
function legaisDe(jogo: GameState, quem: string): Action[] {
  const legais = enumerateLegalActions(jogo, quem);
  if (legais.some((a) => a.type === 'tradeOffer')) return legais;

  const sonda = enumerateLegalActions(jogo, quem, { includeTradeOffers: true }).find(
    (a) => a.type === 'tradeOffer',
  );
  return sonda === undefined ? legais : [...legais, sonda];
}

describe('a sonda de proposta', () => {
  it('abre o compositor em vez de virar jogada', async () => {
    const jogo = naVez(partida());
    const legais = legaisDe(jogo, 'ana');
    const onEscolher = vi.fn();
    const onAbrir = vi.fn();

    // O servidor manda uma só: é sinal, não menu.
    expect(legais.filter((a) => a.type === 'tradeOffer')).toHaveLength(1);

    render(<BarraDeAcoes legais={legais} onEscolher={onEscolher} onAbrir={onAbrir} />);
    await userEvent.click(screen.getByRole('button', { name: /Propor troca/ }));

    expect(onAbrir).toHaveBeenCalledWith('tradeOffer');
    expect(onEscolher).not.toHaveBeenCalled();
  });
});

describe('compositor de proposta', () => {
  function abrir(): { aoEscolher: ReturnType<typeof vi.fn>; jogo: GameState } {
    const jogo = naVez(partida());
    const aoEscolher = vi.fn();

    render(
      <Modais
        mesa={toClientView(jogo, 'ana')}
        legais={legaisDe(jogo, 'ana')}
        modalAberto="tradeOffer"
        hexDoSaqueador={null}
        contrapondo={null}
        aoEscolher={aoEscolher}
        aoFechar={vi.fn()}
      />,
    );

    return { aoEscolher, jogo };
  }

  it('não deixa enviar proposta vazia', () => {
    abrir();
    expect(screen.getByRole('button', { name: 'Enviar proposta' })).toBeDisabled();
  });

  it('não deixa oferecer mais do que se tem', async () => {
    abrir();

    // Ana tem 1 lã: o terceiro clique no `+` não existe.
    const mais = screen.getByRole('button', { name: 'mais Lã em ofereco' });
    await userEvent.click(mais);
    expect(mais).toBeDisabled();
  });

  it('manda exatamente os termos compostos e os alvos marcados', async () => {
    const { aoEscolher } = abrir();

    await userEvent.click(screen.getByRole('button', { name: 'mais Madeira em ofereco' }));
    await userEvent.click(screen.getByRole('button', { name: 'mais Madeira em ofereco' }));
    await userEvent.click(screen.getByRole('button', { name: 'mais Minério em peco' }));

    // Começa com todos marcados; desmarcar a Carla deixa só o Bruno.
    await userEvent.click(screen.getByRole('button', { name: /Carla/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar proposta' }));

    expect(aoEscolher).toHaveBeenCalledWith({
      type: 'tradeOffer',
      player: 'ana',
      terms: { give: conta({ lumber: 2 }), receive: conta({ ore: 1 }) },
      targets: ['bruno'],
    });
  });

  it('sem alvo marcado não há proposta', async () => {
    abrir();

    await userEvent.click(screen.getByRole('button', { name: 'mais Madeira em ofereco' }));
    await userEvent.click(screen.getByRole('button', { name: 'mais Minério em peco' }));
    await userEvent.click(screen.getByRole('button', { name: /Bruno/ }));
    await userEvent.click(screen.getByRole('button', { name: /Carla/ }));

    expect(screen.getByRole('button', { name: 'Enviar proposta' })).toBeDisabled();
  });
});

describe('painel da proposta', () => {
  function montar(jogo: GameState, quem: string) {
    const aoEscolher = vi.fn();
    const aoContrapor = vi.fn();
    const legais = enumerateLegalActions(jogo, quem);

    render(
      <PainelDaProposta
        mesa={toClientView(jogo, quem)}
        legais={legais}
        aoEscolher={aoEscolher}
        aoContrapor={aoContrapor}
      />,
    );

    return { aoEscolher, aoContrapor, legais };
  }

  it('não aparece quando não há proposta na mesa', () => {
    montar(naVez(partida()), 'ana');
    expect(screen.queryByTestId('proposta')).not.toBeInTheDocument();
  });

  it('mostra os termos e quem ainda não respondeu', () => {
    montar(comProposta(partida()), 'carla');

    expect(screen.getByTestId('proposta')).toHaveAttribute('data-proponente', 'ana');
    const respostas = screen.getByTestId('respostas');
    expect(respostas.querySelector('[data-alvo="bruno"]')).toHaveAttribute(
      'data-resposta',
      'aguardando',
    );
  });

  it('o alvo aceita e recusa com as ações que o motor ofereceu', async () => {
    const { aoEscolher, legais } = montar(comProposta(partida()), 'bruno');

    await userEvent.click(screen.getByRole('button', { name: 'Aceitar' }));

    const doMotor = legais.find(
      (a): a is ActionOf<'tradeRespond'> =>
        a.type === 'tradeRespond' && a.response.type === 'accept',
    );
    expect(doMotor).toBeDefined();
    expect(aoEscolher).toHaveBeenCalledWith(doMotor);
  });

  it('quem não é alvo nem proponente só assiste', () => {
    // Proposta dirigida só ao Bruno: a Carla vê, e não tem botão.
    const jogo = comProposta(partida());
    const soParaBruno: GameState = {
      ...jogo,
      activeTrade: { ...jogo.activeTrade!, targets: ['bruno'] },
    };

    montar(soParaBruno, 'carla');

    expect(screen.getByTestId('proposta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceitar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fechar com/ })).not.toBeInTheDocument();
  });

  it('o proponente fecha com quem aceitou, e não com quem recusou', async () => {
    const jogo = comProposta(partida(), {
      bruno: { type: 'accept' },
      carla: { type: 'decline' },
    });
    const { aoEscolher } = montar(jogo, 'ana');

    expect(screen.queryByRole('button', { name: 'Fechar com Carla' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar com Bruno' }));

    expect(aoEscolher).toHaveBeenCalledWith({
      type: 'tradeConfirm',
      player: 'ana',
      tradeId: 't5-1',
      withPlayer: 'bruno',
    });
  });

  it('mostra a contraproposta recebida com os termos dela', () => {
    const jogo = comProposta(partida(), {
      bruno: { type: 'counter', terms: { give: conta({ ore: 1 }), receive: conta({ lumber: 3 }) } },
    });
    montar(jogo, 'ana');

    const linha = screen.getByTestId('respostas').querySelector('[data-alvo="bruno"]');
    expect(linha).toHaveAttribute('data-resposta', 'counter');
    expect(linha).toHaveTextContent('contrapôs');
  });
});

describe('contraproposta', () => {
  it('abre o compositor com os termos invertidos e devolve um counter', async () => {
    const jogo = comProposta(partida());
    const aoEscolher = vi.fn();
    const resposta = enumerateLegalActions(jogo, 'bruno').find(
      (a): a is ActionOf<'tradeRespond'> => a.type === 'tradeRespond',
    );
    if (resposta === undefined) throw new Error('o motor não ofereceu resposta ao alvo');

    render(
      <Modais
        mesa={toClientView(jogo, 'bruno')}
        legais={enumerateLegalActions(jogo, 'bruno')}
        modalAberto={null}
        hexDoSaqueador={null}
        contrapondo={resposta}
        aoEscolher={aoEscolher}
        aoFechar={vi.fn()}
      />,
    );

    // Ana dava 2 madeiras por 1 minério; para o Bruno abre invertido.
    expect(screen.getByTestId('modal')).toHaveTextContent('Contrapropor');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar contraproposta' }));

    expect(aoEscolher).toHaveBeenCalledWith({
      type: 'tradeRespond',
      player: 'bruno',
      tradeId: 't5-1',
      response: {
        type: 'counter',
        terms: { give: conta({ ore: 1 }), receive: conta({ lumber: 2 }) },
      },
    });
  });
});
