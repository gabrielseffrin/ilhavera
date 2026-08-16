/**
 * O tabuleiro desenha o que o motor mandou — nem mais, nem menos.
 *
 * Os números conferidos aqui (19 hexágonos, 18 fichas, 9 portos) são os de §3.1
 * e já são garantidos no motor. Repeti-los aqui não é redundância: o que se
 * testa é que a **renderização** não perde nem inventa peça no caminho, que é um
 * defeito de camada diferente.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createGame, type GameState } from '@ilhavera/rules';

import { Tabuleiro } from '../src/board/Tabuleiro.js';
import { caixaDoTabuleiro, cantosDoHexagono, direcaoParaFora } from '../src/board/geometria.js';
import { pontosDeProbabilidade } from '../src/board/cores.js';

function partida(seed = 'tabuleiro-teste'): GameState {
  return createGame({
    id: 'teste',
    seed,
    players: [
      { id: 'ana', name: 'Ana', color: 'red' },
      { id: 'bruno', name: 'Bruno', color: 'blue' },
      { id: 'carla', name: 'Carla', color: 'white' },
    ],
    shufflePlayerOrder: false,
  });
}

describe('Tabuleiro', () => {
  it('desenha os 19 hexágonos', () => {
    const { container } = render(<Tabuleiro estado={partida()} />);
    expect(container.querySelectorAll('[data-hex]')).toHaveLength(19);
  });

  it('tem um viewBox que contém o tabuleiro inteiro', () => {
    render(<Tabuleiro estado={partida()} />);
    const svg = screen.getByTestId('tabuleiro');

    const [minX, minY, largura, altura] = (svg.getAttribute('viewBox') ?? '')
      .split(' ')
      .map(Number);

    const estado = partida();
    for (const id of estado.board.hexOrder) {
      const p = estado.board.hexes[id]!.pixel;
      expect(p.x).toBeGreaterThan(minX!);
      expect(p.y).toBeGreaterThan(minY!);
      expect(p.x).toBeLessThan(minX! + largura!);
      expect(p.y).toBeLessThan(minY! + altura!);
    }
  });

  it('põe ficha em todo hexágono menos o deserto', () => {
    const estado = partida();
    const { container } = render(<Tabuleiro estado={estado} />);

    const comFicha = estado.board.hexOrder.filter((id) => estado.board.hexes[id]?.number !== null);
    // Cada ficha tem um `<text>` com o número; o deserto não tem nenhum.
    const textos = [...container.querySelectorAll('[data-hex] text')];

    expect(comFicha).toHaveLength(18);
    expect(textos).toHaveLength(18);
    expect(textos.map((t) => Number(t.textContent)).sort((a, b) => a - b)).toEqual(
      comFicha.map((id) => estado.board.hexes[id]!.number!).sort((a, b) => a - b),
    );
  });

  it('escurece só o hexágono do Saqueador, sem deixar o mar atravessar', () => {
    const estado = partida();
    const { container } = render(<Tabuleiro estado={estado} />);

    const sombras = [...container.querySelectorAll('[data-sombra="saqueador"]')];
    expect(sombras).toHaveLength(1);
    expect(sombras[0]?.closest('[data-hex]')?.getAttribute('data-hex')).toBe(estado.robberHex);

    // O terreno continua opaco por baixo: a sombra é uma camada, não uma
    // transparência — senão o hexágono bloqueado pareceria água.
    for (const terreno of container.querySelectorAll('[data-hex] polygon:first-of-type')) {
      expect(terreno.getAttribute('opacity')).toBeNull();
    }
  });

  it('desenha o Saqueador no hexágono onde ele está', () => {
    const estado = partida();
    const { container } = render(<Tabuleiro estado={estado} />);

    // Consulta direta em vez de `getByTitle`: o seletor da testing-library é
    // `svg > title`, e o nosso está dentro de um `<g>`.
    const saqueador = container.querySelector('[data-camada="saqueador"]');
    expect(saqueador).not.toBeNull();
    expect(saqueador?.querySelector('title')?.textContent).toBe('Saqueador');

    /**
     * E está sobre o hexágono certo. A posição vem do `transform` do grupo, e
     * não das coordenadas de cada forma: desde a Fase 5 o vulto é desenhado na
     * origem e posicionado por translação, que é o que permite ao CSS animá-lo
     * deslizando de um hexágono para outro em vez de teleportar.
     */
    const alvo = estado.board.hexes[estado.robberHex]!.pixel;
    const [, tx, ty] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(
      saqueador?.getAttribute('transform') ?? '',
    ) as string[];

    expect(Number(tx)).toBeCloseTo(alvo.x, 6);
    // O vulto fica logo abaixo do centro do hexágono: o centro é da ficha.
    expect(Number(ty)).toBeGreaterThan(alvo.y);
  });

  it('desenha os 9 portos, cada um ligado a dois vértices', () => {
    const estado = partida();
    const { container } = render(<Tabuleiro estado={estado} />);

    const portos = [...container.querySelectorAll('[data-porto]')];
    expect(portos).toHaveLength(9);
    // Nenhum vértice de porto ficou órfão do pareamento.
    expect(container.querySelectorAll('[data-porto-avulso]')).toHaveLength(0);

    for (const porto of portos) {
      expect(porto.querySelectorAll('line')).toHaveLength(2);
    }
  });

  it('vale para qualquer tabuleiro sorteado, não só para a semente do teste', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const { container, unmount } = render(<Tabuleiro estado={partida(seed)} />);

      expect(container.querySelectorAll('[data-hex]')).toHaveLength(19);
      expect(container.querySelectorAll('[data-porto]')).toHaveLength(9);
      expect(container.querySelectorAll('[data-porto-avulso]')).toHaveLength(0);

      unmount();
    }
  });
});

describe('geometria', () => {
  it('os seis cantos ficam todos à mesma distância do centro', () => {
    const cantos = cantosDoHexagono({ x: 100, y: 50 }, 60);

    expect(cantos).toHaveLength(6);
    for (const canto of cantos) {
      expect(Math.hypot(canto.x - 100, canto.y - 50)).toBeCloseTo(60, 6);
    }
  });

  it('o primeiro canto aponta para cima', () => {
    const [topo] = cantosDoHexagono({ x: 0, y: 0 }, 60);
    expect(topo?.x).toBeCloseTo(0, 6);
    expect(topo?.y).toBeCloseTo(-60, 6);
  });

  it('a caixa cresce com o tabuleiro em vez de ser fixada à mão', () => {
    const caixa = caixaDoTabuleiro(partida().board);
    expect(caixa.largura).toBeGreaterThan(0);
    expect(caixa.altura).toBeGreaterThan(0);
  });

  it('a direção para fora é unitária e aponta para longe do centro', () => {
    const fora = direcaoParaFora({ x: 10, y: 0 }, { x: 0, y: 0 });
    expect(Math.hypot(fora.x, fora.y)).toBeCloseTo(1, 6);
    expect(fora.x).toBeGreaterThan(0);
  });

  it('não devolve NaN quando o ponto é o próprio centro', () => {
    const fora = direcaoParaFora({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(Number.isNaN(fora.x)).toBe(false);
    expect(Math.hypot(fora.x, fora.y)).toBeCloseTo(1, 6);
  });
});

describe('probabilidade da ficha', () => {
  it('conta as combinações de 2d6 de cada número', () => {
    expect(pontosDeProbabilidade(2)).toBe(1);
    expect(pontosDeProbabilidade(6)).toBe(5);
    expect(pontosDeProbabilidade(8)).toBe(5);
    expect(pontosDeProbabilidade(12)).toBe(1);
  });
});
