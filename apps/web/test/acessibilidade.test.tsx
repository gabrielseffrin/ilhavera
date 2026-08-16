/**
 * Acessibilidade — Fase 5, M3.
 *
 * Três coisas, e a primeira é a que decide se dá para jogar sem mouse: os alvos
 * do tabuleiro são `<circle>` e `<polygon>`, não `<button>`. Nada neles é botão
 * de graça — foco, Enter, Espaço e rótulo são todos código deste repositório, e
 * por isso todos precisam de teste.
 *
 * Sobre o limite do que se prova aqui: num `<button>` de verdade, quem
 * transforma Enter em clique é o navegador, e o jsdom não implementa isso.
 * Testar essa parte seria testar o jsdom. Por isso o robô de teclado aciona os
 * alvos do tabuleiro pelo teclado e os botões por clique — e o teste **exige**
 * que a partida tenha passado pelo teclado um número honesto de vezes, senão
 * ele estaria se contentando com uma partida feita só de cliques em botão.
 */

import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { montarHotSeat } from './helpers/hotseat.js';
import { acionar, proximoClique } from './helpers/robo.js';

describe('alvos do tabuleiro pelo teclado', () => {
  it('todo alvo legal é focável, é anunciado como botão e diz onde fica', () => {
    const { container, unmount } = montarHotSeat('a11y-1');

    const alvos = [
      ...container.querySelectorAll('[data-vertice-legal] circle:last-of-type'),
      ...container.querySelectorAll('[data-aresta-legal] line:last-of-type'),
    ];
    expect(alvos.length).toBeGreaterThan(0);

    for (const alvo of alvos) {
      expect(alvo.getAttribute('role')).toBe('button');
      expect(alvo.getAttribute('tabindex')).toBe('0');

      const rotulo = alvo.getAttribute('aria-label') ?? '';
      // O rótulo tem que dizer **o quê** e **onde**. "Construir estrada", sem
      // dizer entre o quê, não serve para quem não está vendo o desenho.
      expect(rotulo).toMatch(/Construir|Evoluir/);
      expect(rotulo).toMatch(/ entre /);
      expect(rotulo.length).toBeGreaterThan(25);
    }

    unmount();
  });

  it('Enter num vértice focado coloca a peça', () => {
    const { container, partida, unmount } = montarHotSeat('a11y-2');
    const antes = partida.getState().mesa?.version ?? -1;

    const alvo = container.querySelector('[data-vertice-legal] circle:last-of-type');
    expect(alvo).not.toBeNull();

    act(() => {
      (alvo as unknown as HTMLElement).focus();
      fireEvent.keyDown(alvo as Element, { key: 'Enter' });
    });

    expect(partida.getState().mesa?.version).toBe(antes + 1);
    unmount();
  });

  it('Espaço também aciona, e segura a rolagem da página', () => {
    const { container, partida, unmount } = montarHotSeat('a11y-3');
    const antes = partida.getState().mesa?.version ?? -1;

    const alvo = container.querySelector('[data-vertice-legal] circle:last-of-type') as Element;

    // Sem `preventDefault`, o Espaço rola a página: um `<circle>` não tem o
    // comportamento de botão que o `role` promete.
    let evitado = false;
    act(() => {
      (alvo as unknown as HTMLElement).focus();
      const evento = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      alvo.dispatchEvent(evento);
      evitado = evento.defaultPrevented;
    });

    expect(partida.getState().mesa?.version).toBe(antes + 1);
    expect(evitado).toBe(true);
    unmount();
  });

  it('tecla qualquer não dispara jogada nenhuma', () => {
    const { container, partida, unmount } = montarHotSeat('a11y-4');
    const antes = partida.getState().mesa?.version ?? -1;

    const alvo = container.querySelector('[data-vertice-legal] circle:last-of-type') as Element;
    act(() => {
      fireEvent.keyDown(alvo, { key: 'a' });
      fireEvent.keyDown(alvo, { key: 'Tab' });
    });

    expect(partida.getState().mesa?.version).toBe(antes);
    unmount();
  });

  it('uma partida inteira, com o tabuleiro dirigido só pelo teclado', () => {
    const { container, partida, unmount } = montarHotSeat('aceite-1');

    const mesaAgora = (): NonNullable<ReturnType<typeof partida.getState>['mesa']> => {
      const atual = partida.getState().mesa;
      if (atual === null) throw new Error('hot-seat sem mesa');
      return atual;
    };

    let passos = 0;
    let pelasTeclas = 0;

    while (mesaAgora().winner === null && passos < 4000) {
      const alvo = proximoClique(container, passos);
      if (alvo === null) {
        throw new Error(
          `interface travada na fase ${mesaAgora().phase} após ${passos} passos pelo teclado`,
        );
      }

      act(() => {
        if (acionar(alvo)) pelasTeclas++;
      });
      passos++;

      if (screen.queryByRole('alert') !== null) {
        throw new Error(
          `passo ${passos} recusado na fase ${mesaAgora().phase}: ` +
            `${screen.getByRole('alert').textContent}`,
        );
      }
    }

    expect(mesaAgora().winner, 'a partida não terminou pelo teclado').not.toBeNull();
    // Sem este piso, uma partida feita inteira de cliques em botão passaria e
    // não provaria nada sobre o tabuleiro.
    expect(pelasTeclas).toBeGreaterThan(50);

    unmount();
  }, 60_000);
});

describe('modal: foco e Escape', () => {
  /** Abre o modal de comércio com o banco, que é dispensável (tem Cancelar). */
  async function abrirTrocaComBanco(container: HTMLElement): Promise<boolean> {
    for (let i = 0; i < 400; i++) {
      const botao = container.querySelector(
        '[data-testid="barra-de-acoes"] [data-acao="tradeBank"]',
      );
      if (botao !== null) {
        await act(async () => {
          fireEvent.click(botao);
          await Promise.resolve();
        });
        return true;
      }

      const alvo = proximoClique(container, i);
      if (alvo === null) return false;
      await act(async () => {
        fireEvent.click(alvo);
        await Promise.resolve();
      });
    }
    return false;
  }

  it('o foco entra ao abrir e volta ao fechar', async () => {
    const { container, unmount } = montarHotSeat('a11y-modal');
    expect(await abrirTrocaComBanco(container)).toBe(true);

    const modal = within(container).getByTestId('modal');
    // O foco tem que estar **dentro** do diálogo: um modal que abre e deixa o
    // foco no botão atrás continua invisível para quem navega por teclado.
    expect(modal.contains(document.activeElement)).toBe(true);

    await act(async () => {
      fireEvent.keyDown(modal.querySelector('[role="dialog"]') as Element, { key: 'Escape' });
      await Promise.resolve();
    });

    expect(within(container).queryByTestId('modal')).not.toBeInTheDocument();
    unmount();
  });

  it('o Escape não atravessa para outra árvore montada no mesmo documento', async () => {
    // A dívida da Fase 4: o ouvinte morava em `window`, e um Escape fechava o
    // modal de todas as telas montadas. Com três `<App/>` num documento, isso
    // deixa de ser detalhe.
    const primeira = montarHotSeat('a11y-vizinha-1');
    const segunda = montarHotSeat('a11y-vizinha-2');

    expect(await abrirTrocaComBanco(primeira.container)).toBe(true);
    expect(await abrirTrocaComBanco(segunda.container)).toBe(true);

    const dialogoDaPrimeira = within(primeira.container)
      .getByTestId('modal')
      .querySelector('[role="dialog"]') as Element;

    await act(async () => {
      fireEvent.keyDown(dialogoDaPrimeira, { key: 'Escape' });
      await Promise.resolve();
    });

    expect(within(primeira.container).queryByTestId('modal')).not.toBeInTheDocument();
    expect(within(segunda.container).queryByTestId('modal')).toBeInTheDocument();

    primeira.unmount();
    segunda.unmount();
  }, 30_000);

  it('o Tab circula dentro do diálogo em vez de escapar para o tabuleiro', async () => {
    const usuario = userEvent.setup();
    const { container, unmount } = montarHotSeat('a11y-tab');
    expect(await abrirTrocaComBanco(container)).toBe(true);

    const dialogo = within(container).getByTestId('modal').querySelector('[role="dialog"]');
    const focaveis = [...(dialogo?.querySelectorAll('button') ?? [])];
    expect(focaveis.length).toBeGreaterThan(1);

    const ultimo = focaveis[focaveis.length - 1] as HTMLElement;
    ultimo.focus();
    await usuario.tab();

    // Do último volta para o primeiro. Sem isso, o Tab sai do modal e vai
    // passear pelos vértices que o fundo escuro diz que não dá para clicar.
    expect(dialogo?.contains(document.activeElement)).toBe(true);
    unmount();
  }, 30_000);
});

describe('anúncios', () => {
  it('a faixa de vez é assertiva, e o histórico é polido', () => {
    const { container, unmount } = montarHotSeat('a11y-anuncio');

    const vez = within(container).getByTestId('vez-de');
    expect(vez).toHaveAttribute('aria-live', 'assertive');

    // "É a sua vez" não pode esperar o leitor de tela terminar de narrar o
    // turno alheio; o histórico pode.
    const log = within(container).getByTestId('log').querySelector('[role="log"]');
    expect(log).toHaveAttribute('aria-live', 'polite');

    unmount();
  });

  it('cada hexágono se anuncia com terreno, ficha e o Saqueador quando ele está lá', () => {
    const { container, partida, unmount } = montarHotSeat('a11y-hex');

    const hexes = [...container.querySelectorAll('[data-hex]')];
    expect(hexes).toHaveLength(19);
    for (const hex of hexes) {
      expect(hex.getAttribute('aria-label')).toBeTruthy();
    }

    const bloqueado = container.querySelector(
      `[data-hex="${partida.getState().mesa?.robberHex ?? ''}"]`,
    );
    // O Saqueador muda a jogada: quem só ouve a tela precisa saber onde ele
    // está tanto quanto quem vê a sombra.
    expect(bloqueado?.getAttribute('aria-label')).toContain('Saqueador');

    unmount();
  });
});
