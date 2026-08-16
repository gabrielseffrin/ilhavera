/**
 * A interface só oferece o que o motor aceita — e aceita o que oferece.
 *
 * A garantia central desta fase: o destaque de jogada legal vem de
 * `enumerateLegalActions`, a mesma função que o servidor usa para validar. Um
 * clique num ponto destacado nunca pode ser recusado; se for, o defeito é da
 * ponte entre a interface e o motor, e é isso que estes testes vigiam.
 */

import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { enumerateLegalActions, type Action, type GameState } from '@ilhavera/rules';

import { quemAge } from '../src/estado/driver.js';
import { montarHotSeat, type MesaDeTeste } from './helpers/hotseat.js';

const SEMENTE = 'teste-de-interacao';

let mesa: MesaDeTeste;

beforeEach(() => {
  mesa = montarHotSeat(SEMENTE);
});

/** O que o motor aceita agora — a lista contra a qual a tela é conferida. */
function jogadasLegais(jogo: GameState): Action[] {
  const ativo = quemAge(jogo);
  return ativo === null ? [] : enumerateLegalActions(jogo, ativo);
}

function jogadorAtivo(jogo: GameState): string | null {
  return quemAge(jogo);
}

/** Clica no primeiro alvo destacado do tabuleiro. */
async function clicarNoPrimeiroDestaque(container: HTMLElement): Promise<void> {
  const alvo =
    container.querySelector('[data-vertice-legal] circle:last-of-type') ??
    container.querySelector('[data-aresta-legal] line:last-of-type');

  if (alvo === null) throw new Error('nenhum destaque no tabuleiro');
  await userEvent.click(alvo);
}

describe('camada interativa', () => {
  it('destaca exatamente os vértices que o motor aceita', () => {
    const { container } = mesa;
    const jogo = mesa.jogo();

    const legais = jogadasLegais(jogo).filter(
      (a) => a.type === 'placeSettlement' || a.type === 'buildCity',
    );
    const destacados = container.querySelectorAll('[data-vertice-legal]');

    expect(destacados.length).toBeGreaterThan(0);
    expect(destacados).toHaveLength(new Set(legais.map((a) => a.vertexId)).size);
  });

  it('não destaca nada fora da lista de legais', () => {
    const { container } = mesa;
    const jogo = mesa.jogo();

    const permitidos = new Set(
      jogadasLegais(jogo)
        .filter((a) => a.type === 'placeSettlement' || a.type === 'buildCity')
        .map((a) => a.vertexId),
    );

    for (const no of container.querySelectorAll('[data-vertice-legal]')) {
      expect(permitidos).toContain(no.getAttribute('data-vertice-legal'));
    }
  });

  it('clicar num destaque aplica a jogada e anda a versão', async () => {
    const { container } = mesa;
    const antes = mesa.jogo().version;

    await clicarNoPrimeiroDestaque(container);

    const depois = mesa.jogo();
    expect(depois.version).toBe(antes + 1);
    expect(mesa.partida.getState().erro).toBeNull();
  });

  it('nenhum clique em destaque é recusado ao longo do setup inteiro', async () => {
    const { container } = mesa;

    // 3 jogadores × 2 rodadas × (assentamento + estrada) = 12 jogadas.
    for (let i = 0; i < 12; i++) {
      await clicarNoPrimeiroDestaque(container);
      expect(mesa.partida.getState().erro, `jogada ${i + 1} recusada`).toBeNull();
    }

    const jogo = mesa.jogo();
    expect(jogo.phase).toBe('awaitingRoll');
    expect(jogo.version).toBe(12);
  });
});

describe('barra de ações', () => {
  it('fica escondida enquanto só houver jogada de tabuleiro', () => {
    // a mesa já está montada pelo `beforeEach`
    // No setup só se coloca peça: rolar e encerrar ainda não existem.
    expect(screen.queryByRole('button', { name: 'Rolar os dados' })).not.toBeInTheDocument();
  });

  it('mostra rolar dados quando o setup termina', async () => {
    const { container } = mesa;
    for (let i = 0; i < 12; i++) await clicarNoPrimeiroDestaque(container);

    expect(screen.getByRole('button', { name: 'Rolar os dados' })).toBeInTheDocument();
  });

  it('rolar dados avança a partida', async () => {
    const { container } = mesa;
    for (let i = 0; i < 12; i++) await clicarNoPrimeiroDestaque(container);

    await userEvent.click(screen.getByRole('button', { name: 'Rolar os dados' }));

    const jogo = mesa.jogo();
    expect(jogo.lastRoll).not.toBeNull();
    expect(mesa.partida.getState().erro).toBeNull();
  });
});

describe('peças', () => {
  it('aparecem no tabuleiro assim que são construídas', async () => {
    const { container } = mesa;
    expect(container.querySelectorAll('[data-assentamento]')).toHaveLength(0);

    // A ordem de turno é sorteada em `createGame`, então quem começa vem do
    // estado — fixar um nome aqui seria testar a semente, não a interface.
    const primeiro = jogadorAtivo(mesa.jogo());
    await clicarNoPrimeiroDestaque(container);

    const assentamentos = container.querySelectorAll('[data-assentamento]');
    expect(assentamentos).toHaveLength(1);
    expect(assentamentos[0]?.getAttribute('data-dono')).toBe(primeiro);
  });

  it('a estrada aparece com o dono certo', async () => {
    const { container } = mesa;
    const primeiro = jogadorAtivo(mesa.jogo());

    await clicarNoPrimeiroDestaque(container); // assentamento
    await clicarNoPrimeiroDestaque(container); // estrada

    const estradas = container.querySelectorAll('[data-estrada]');
    expect(estradas).toHaveLength(1);
    expect(estradas[0]?.getAttribute('data-dono')).toBe(primeiro);
  });
});

describe('recusa do motor', () => {
  it('explica o motivo em português em vez de piscar em vermelho', async () => {
    // a mesa já está montada pelo `beforeEach`
    const jogo = mesa.jogo();
    const naoEDaVez = jogo.players.find((p) => p.id !== jogadorAtivo(jogo));
    if (naoEDaVez === undefined) throw new Error('mesa de um jogador só');

    // Uma jogada que o motor recusa, vinda de fora da camada interativa —
    // é o caminho que a Fase 4 vai exercitar quando o servidor discordar.
    // O `act` é por vir de fora do React: sem ele o React avisa que a tela foi
    // atualizada por baixo do teste.
    act(() => {
      mesa.partida.getState().executar({
        type: 'placeSettlement',
        player: naoEDaVez.id,
        vertexId: jogo.board.vertexOrder[0]!,
      });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Não é a sua vez.');
  });

  it('some quando a jogada seguinte dá certo', async () => {
    const { container } = mesa;
    const jogo = mesa.jogo();

    act(() => {
      mesa.partida.getState().executar({
        type: 'buildCity',
        player: jogadorAtivo(jogo)!,
        vertexId: jogo.board.vertexOrder[0]!,
      });
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await clicarNoPrimeiroDestaque(container);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('nova partida', () => {
  it('recomeça do zero com outro tabuleiro', async () => {
    const { container } = mesa;
    await clicarNoPrimeiroDestaque(container);
    expect(mesa.jogo().version).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: 'Nova partida' }));

    expect(mesa.jogo().version).toBe(0);
    expect(container.querySelectorAll('[data-assentamento]')).toHaveLength(0);
  });
});

describe('de quem é a vez', () => {
  it('anuncia quem precisa agir', () => {
    // a mesa já está montada pelo `beforeEach`
    const jogo = mesa.jogo();
    const ativo = jogo.players.find((p) => p.id === jogadorAtivo(jogo));

    expect(screen.getByTestId('vez-de')).toHaveTextContent(ativo?.name ?? '');
  });

  it('passa para o próximo jogador no setup', async () => {
    const { container } = mesa;
    const primeiro = jogadorAtivo(mesa.jogo());

    // Assentamento e estrada encerram a vez daquele jogador no setup.
    await clicarNoPrimeiroDestaque(container);
    await clicarNoPrimeiroDestaque(container);

    expect(jogadorAtivo(mesa.jogo())).not.toBe(primeiro);
  });
});
