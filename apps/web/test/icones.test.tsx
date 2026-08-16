/**
 * Os ícones da HUD.
 *
 * Duas coisas são vigiadas aqui, e as duas quebram em silêncio.
 *
 * **Que o ícone seja decorativo.** Um `<title>` dentro do SVG entra no
 * `textContent` do elemento que o embrulha — e no painel de adversários isso
 * faria o nome de um recurso aparecer numa linha que só pode dizer *quantas*
 * cartas o outro tem. Seria a fronteira de §4.5 furada por um detalhe de
 * desenho, com a tela continuando bonita. `paineis.test.tsx` pega o caso do
 * recurso; aqui a regra é geral, para valer também para o ícone que ainda não
 * existe.
 *
 * **Que o desenho exista para todo caso do domínio.** O `Record<Resource, …>` e
 * o `Record<Simbolo, …>` já fazem recurso ou carta nova sem ícone não compilar —
 * mesma garantia dos rótulos e da narração. O que o tipo não pega é o desenho
 * ficar vazio, e é isso que se confere aqui.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DEV_CARDS, RESOURCES, createGame, toClientView, type Resource } from '@ilhavera/rules';

import { IconeDeRecurso } from '../src/hud/icones/IconeDeRecurso.js';
import { IconeDeSimbolo, type Simbolo } from '../src/hud/icones/IconeDeSimbolo.js';
import { PainelDaMao } from '../src/hud/PainelDaMao.js';

const SIMBOLOS_PROPRIOS: Simbolo[] = [
  'carta',
  'progresso',
  'vez',
  'relogio',
  'som',
  'mudo',
  'trofeu',
];

describe('ícones', () => {
  it('todo recurso tem um desenho, e nenhum se anuncia', () => {
    for (const recurso of RESOURCES) {
      const { container, unmount } = render(<IconeDeRecurso recurso={recurso} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('aria-hidden');
      expect(svg?.querySelector('title')).toBeNull();
      // Um `d` vazio compila e desenha nada.
      expect(svg?.querySelector('path')?.getAttribute('d')?.length ?? 0).toBeGreaterThan(10);

      unmount();
    }
  });

  it('todo símbolo tem um desenho, e nenhum se anuncia', () => {
    for (const simbolo of [...SIMBOLOS_PROPRIOS, ...DEV_CARDS]) {
      const { container, unmount } = render(<IconeDeSimbolo simbolo={simbolo} />);
      const svg = container.querySelector('svg');

      expect(svg).toHaveAttribute('aria-hidden');
      expect(svg?.querySelector('title')).toBeNull();
      expect(svg?.querySelector('path')?.getAttribute('d')?.length ?? 0).toBeGreaterThan(10);

      unmount();
    }
  });

  it('a mão desenha um ícone por recurso, e o nome continua legível ao lado', () => {
    const jogo = createGame({
      id: 'icones',
      seed: 'icones',
      players: [
        { id: 'ana', name: 'Ana', color: 'red' },
        { id: 'bruno', name: 'Bruno', color: 'blue' },
        { id: 'carla', name: 'Carla', color: 'white' },
      ],
      shufflePlayerOrder: false,
    });
    const mesa = toClientView(
      {
        ...jogo,
        players: jogo.players.map((p) =>
          p.id === 'ana'
            ? { ...p, resources: { lumber: 3, brick: 0, wool: 1, grain: 2, ore: 0 } }
            : p,
        ),
      },
      'ana',
    );

    render(<PainelDaMao voce={mesa.you} turno={mesa.turnNumber} />);
    const painel = screen.getByTestId('painel-da-mao');

    for (const recurso of RESOURCES) {
      const carta = painel.querySelector(`[data-recurso="${recurso}"]`);
      expect(carta?.querySelector(`[data-icone="${recurso}"]`)).not.toBeNull();
    }

    /* O ícone acrescenta, não substitui: quem está aprendendo o jogo lê o nome,
       e quem já sabe reconhece o desenho. Trocar um pelo outro transformaria a
       mão num teste de memória. */
    const nomes: Record<Resource, string> = {
      lumber: 'Madeira',
      brick: 'Tijolo',
      wool: 'Lã',
      grain: 'Trigo',
      ore: 'Minério',
    };
    for (const recurso of RESOURCES) {
      expect(painel.querySelector(`[data-recurso="${recurso}"]`)).toHaveTextContent(nomes[recurso]);
    }
  });
});
