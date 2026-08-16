/**
 * As peças desenhadas a partir de um estado montado à mão.
 *
 * A cidade não aparece num setup — ela só existe depois de alguém evoluir um
 * assentamento, muitos turnos adiante. Montar o estado direto é o que permite
 * testar o desenho dela sem jogar uma partida inteira.
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createGame, type PlayerColor, type PlayerId } from '@ilhavera/rules';

import { Pecas } from '../src/board/Pecas.js';
import { COR_DO_JOGADOR } from '../src/board/cores.js';

const jogo = createGame({
  id: 'pecas',
  seed: 'pecas',
  players: [
    { id: 'ana', name: 'Ana', color: 'red' },
    { id: 'bruno', name: 'Bruno', color: 'blue' },
    { id: 'carla', name: 'Carla', color: 'white' },
  ],
  shufflePlayerOrder: false,
});

const CORES: Record<PlayerId, PlayerColor> = { ana: 'red', bruno: 'blue', carla: 'white' };

function desenhar(
  buildings: Parameters<typeof Pecas>[0]['buildings'],
  roads: Parameters<typeof Pecas>[0]['roads'] = {},
): HTMLElement {
  const { container } = render(
    <svg>
      <Pecas board={jogo.board} buildings={buildings} roads={roads} cores={CORES} />
    </svg>,
  );
  return container;
}

const PRIMEIRO_VERTICE = jogo.board.vertexOrder[0] as string;
const PRIMEIRA_ARESTA = jogo.board.edgeOrder[0] as string;

describe('Pecas', () => {
  it('desenha cidade com forma diferente de assentamento', () => {
    const comCidade = desenhar({ [PRIMEIRO_VERTICE]: { owner: 'ana', type: 'city' } });
    const cidade = comCidade.querySelector('[data-cidade]');

    expect(cidade).not.toBeNull();
    expect(comCidade.querySelector('[data-assentamento]')).toBeNull();
    expect(cidade?.getAttribute('data-dono')).toBe('ana');
    expect(corpo(cidade)?.getAttribute('fill')).toBe(COR_DO_JOGADOR.red);

    // A cidade é mais larga que o assentamento — é assim que se distinguem de
    // longe, sem depender de cor.
    const comCasa = desenhar({ [PRIMEIRO_VERTICE]: { owner: 'ana', type: 'settlement' } });
    expect(largura(corpo(cidade))).toBeGreaterThan(
      largura(corpo(comCasa.querySelector('[data-assentamento]'))),
    );
  });

  it('cada jogador sai na própria cor', () => {
    const segundo = jogo.board.vertexOrder[5] as string;
    const container = desenhar({
      [PRIMEIRO_VERTICE]: { owner: 'ana', type: 'settlement' },
      [segundo]: { owner: 'bruno', type: 'city' },
    });

    expect(corpo(container.querySelector('[data-assentamento]'))?.getAttribute('fill')).toBe(
      COR_DO_JOGADOR.red,
    );
    expect(corpo(container.querySelector('[data-cidade]'))?.getAttribute('fill')).toBe(
      COR_DO_JOGADOR.blue,
    );
  });

  /**
   * Cor sozinha não basta: `red` e `green` são a dupla clássica da deuteranopia,
   * e uma mesa em que não se distingue de quem é a estrada não é jogável. O que
   * se vigia aqui é que o segundo sinal existe e é **diferente** entre jogadores
   * — não que ele seja um losango em vez de um triângulo.
   */
  it('cada jogador leva uma marca própria, além da cor', () => {
    const segundo = jogo.board.vertexOrder[5] as string;
    const container = desenhar({
      [PRIMEIRO_VERTICE]: { owner: 'ana', type: 'settlement' },
      [segundo]: { owner: 'bruno', type: 'city' },
    });

    const daAna = container.querySelector('[data-assentamento]')?.getAttribute('data-marca');
    const doBruno = container.querySelector('[data-cidade]')?.getAttribute('data-marca');

    expect(daAna).toBeTruthy();
    expect(doBruno).toBeTruthy();
    expect(daAna).not.toBe(doBruno);
  });

  it('estradas de jogadores diferentes têm padrões de traço diferentes', () => {
    const outra = jogo.board.edgeOrder[1] as string;
    const container = desenhar(
      {},
      { [PRIMEIRA_ARESTA]: { owner: 'bruno' }, [outra]: { owner: 'carla' } },
    );

    const padrao = (dono: string): string | null =>
      container
        .querySelector(`[data-estrada][data-dono="${dono}"] line:last-of-type`)
        ?.getAttribute('stroke-dasharray') ?? null;

    // Numa linha de poucos pixels não cabe símbolo; o que distingue linha de
    // linha é o padrão do traço.
    expect(padrao('bruno')).not.toBe(padrao('carla'));
  });

  it('a estrada leva contorno escuro por baixo da cor', () => {
    const container = desenhar({}, { [PRIMEIRA_ARESTA]: { owner: 'carla' } });
    const linhas = container.querySelectorAll('[data-estrada] line');

    expect(linhas).toHaveLength(2);
    // O contorno é o de baixo e o mais grosso.
    const grossura = (i: number) => Number(linhas[i]?.getAttribute('stroke-width'));
    expect(grossura(0)).toBeGreaterThan(grossura(1));
    expect(linhas[1]?.getAttribute('stroke')).toBe(COR_DO_JOGADOR.white);
    // E o de baixo é sólido: tracejar os dois deixaria o terreno aparecer pelos
    // vãos, justamente onde o contraste já é pior.
    expect(linhas[0]?.getAttribute('stroke-dasharray')).toBeNull();
  });

  it('ignora peça de jogador que não está na partida em vez de explodir', () => {
    const container = desenhar(
      { [PRIMEIRO_VERTICE]: { owner: 'fantasma', type: 'settlement' } },
      { [PRIMEIRA_ARESTA]: { owner: 'fantasma' } },
    );

    expect(container.querySelectorAll('[data-assentamento]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-estrada]')).toHaveLength(0);
  });

  it('ignora referência a vértice ou aresta inexistente', () => {
    const container = desenhar(
      { 'nao-existe': { owner: 'ana', type: 'settlement' } },
      { 'nem-esta': { owner: 'ana' } },
    );

    expect(container.querySelectorAll('[data-assentamento]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-estrada]')).toHaveLength(0);
  });
});

/** O polígono da peça, dentro do `<g>` que carrega os `data-*` e a marca. */
function corpo(peca: Element | null): Element | null {
  return peca?.querySelector('polygon') ?? null;
}

/** Largura do bounding box horizontal de um polígono, pelos pontos. */
function largura(poligono: Element | null): number {
  const pontos = (poligono?.getAttribute('points') ?? '')
    .trim()
    .split(/\s+/)
    .map((par) => Number(par.split(',')[0]));

  return pontos.length === 0 ? 0 : Math.max(...pontos) - Math.min(...pontos);
}
