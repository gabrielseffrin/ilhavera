/**
 * A legibilidade do tabuleiro.
 *
 * Os três defeitos que a 5.5 corrigiu aqui eram **funcionais**, não estéticos, e
 * os três podem voltar sem que nenhum outro teste perceba: uma paleta reajustada
 * "para ficar mais bonita", um raio de pontinho reduzido para caber melhor, uma
 * marca d'água copiada à mão que deixa de acompanhar o motor.
 *
 * O jsdom não mede contraste nem desenha pixel. O que dá para provar é o que
 * está escrito no SVG — e é o suficiente para as três regressões.
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  HEX_SIZE,
  TERRAINS,
  TERRAIN_PRODUCES,
  createGame,
  type GameState,
  type Terrain,
} from '@ilhavera/rules';

import { Tabuleiro } from '../src/board/Tabuleiro.js';
import { COR_DO_TERRENO } from '../src/board/cores.js';
import { CAMINHO_DO_TERRENO } from '../src/board/terrenos.js';
import { CAMINHO_DO_RECURSO } from '../src/hud/icones/IconeDeRecurso.js';

function partida(): GameState {
  return createGame({
    id: 'terrenos',
    seed: 'terrenos',
    players: [
      { id: 'ana', name: 'Ana', color: 'red' },
      { id: 'bruno', name: 'Bruno', color: 'blue' },
      { id: 'carla', name: 'Carla', color: 'white' },
    ],
    shufflePlayerOrder: false,
  });
}

type Oklch = { l: number; c: number; h: number };

function lerOklch(cor: string): Oklch {
  const m = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(cor);
  if (m === null) throw new Error(`cor de terreno fora do formato oklch: ${cor}`);
  return { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]) };
}

/** Distância de matiz no círculo: 350° e 10° são vizinhos, não opostos. */
function distanciaDeMatiz(a: number, b: number): number {
  const bruta = Math.abs(a - b) % 360;
  return bruta > 180 ? 360 - bruta : bruta;
}

describe('paleta dos terrenos', () => {
  /**
   * **A regra:** dois terrenos se separam por luminosidade, a menos que os
   * matizes já estejam longe.
   *
   * A luminosidade é o único eixo que sobrevive a todos os tipos de daltonismo;
   * matiz só ajuda quando a diferença é grande. Croma sozinho **não** conta, e é
   * exatamente essa a armadilha em que a paleta da Fase 3 caiu: Campo
   * (`0.84 0.14 92`) e Deserto (`0.86 0.05 88`) tinham o mesmo matiz e dois
   * centésimos de luminosidade de diferença, e a única separação era saturação —
   * que se lê como "a mesma cor mais lavada", não como outro terreno.
   */
  it('nenhum par de terrenos se distingue só pela saturação', () => {
    const problemas: string[] = [];

    for (const a of TERRAINS) {
      for (const b of TERRAINS) {
        if (a >= b) continue;
        const ca = lerOklch(COR_DO_TERRENO[a]);
        const cb = lerOklch(COR_DO_TERRENO[b]);
        const deltaL = Math.abs(ca.l - cb.l);
        const deltaH = distanciaDeMatiz(ca.h, cb.h);

        if (deltaL < 0.06 && deltaH < 60) {
          problemas.push(`${a}/${b}: ΔL ${deltaL.toFixed(2)}, Δmatiz ${deltaH.toFixed(0)}°`);
        }
      }
    }

    expect(problemas).toEqual([]);
  });

  it('a marca d’água de cada terreno é a do recurso que ele produz', () => {
    for (const terreno of TERRAINS) {
      const recurso = TERRAIN_PRODUCES[terreno];
      if (recurso === null) {
        // O deserto não produz nada, e ainda assim precisa de desenho: um
        // hexágono vazio se lê como esquecimento, não como "não produz".
        expect(CAMINHO_DO_TERRENO[terreno].length).toBeGreaterThan(10);
        expect(Object.values(CAMINHO_DO_RECURSO)).not.toContain(CAMINHO_DO_TERRENO[terreno]);
      } else {
        expect(CAMINHO_DO_TERRENO[terreno]).toBe(CAMINHO_DO_RECURSO[recurso]);
      }
    }
  });
});

describe('desenho do tabuleiro', () => {
  it('todo hexágono leva a marca do seu terreno', () => {
    const estado = partida();
    const { container } = render(<Tabuleiro estado={estado} />);

    const marcas = [...container.querySelectorAll('[data-marca-do-terreno]')];
    expect(marcas).toHaveLength(19);

    for (const marca of marcas) {
      const terreno = marca.getAttribute('data-marca-do-terreno') as Terrain;
      expect(marca.getAttribute('d')).toBe(CAMINHO_DO_TERRENO[terreno]);
      // Decorativa: quem recebe clique é a camada interativa, acima desta.
      expect(marca.getAttribute('pointer-events')).toBe('none');
    }
  });

  /**
   * Os pontinhos nasceram com raio `HEX_SIZE * 0.022` — **1,32px** num hexágono
   * de raio 60. Existiam no DOM e não na tela, o que é a pior combinação: a
   * informação parecia entregue. O piso aqui é o que separa "desenhado" de
   * "visível", e existe para o próximo ajuste de layout não os encolher de novo.
   */
  it('os pontinhos de probabilidade têm tamanho de coisa visível', () => {
    const estado = partida();
    const { container } = render(<Tabuleiro estado={estado} />);

    const fichas = [...container.querySelectorAll('[data-hex] circle')];
    expect(fichas.length).toBeGreaterThan(18);

    const pontos = fichas.map((c) => Number(c.getAttribute('r'))).filter((r) => r < HEX_SIZE * 0.1);

    expect(pontos.length).toBeGreaterThan(0);
    for (const raio of pontos) {
      expect(raio).toBeGreaterThanOrEqual(HEX_SIZE * 0.03);
    }
  });

  it('a costa fica sob os hexágonos, um halo por hexágono', () => {
    const estado = partida();
    const { container } = render(<Tabuleiro estado={estado} />);

    const costa = container.querySelector('[data-camada="costa"]');
    const hexagonos = container.querySelector('[data-camada="hexagonos"]');
    expect(costa?.querySelectorAll('polygon')).toHaveLength(19);

    /* Ordem no DOM é ordem de pintura no SVG: a costa precisa vir antes, senão
       ela cobre o terreno em vez de emoldurá-lo. */
    expect(costa?.compareDocumentPosition(hexagonos!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('cada porto 2:1 mostra o desenho do recurso, e o 3:1 não', () => {
    const estado = partida();
    const { container } = render(<Tabuleiro estado={estado} />);

    const portos = [...container.querySelectorAll('[data-porto]')];
    expect(portos).toHaveLength(9);

    const genericos = portos.filter((p) => p.getAttribute('data-porto') === 'generic');
    expect(genericos).toHaveLength(4);

    for (const porto of portos) {
      const tipo = porto.getAttribute('data-porto');
      const icone = porto.querySelector('path');
      if (tipo === 'generic') {
        expect(icone).toBeNull();
      } else {
        expect(icone?.getAttribute('d')).toBe(
          CAMINHO_DO_RECURSO[tipo as keyof typeof CAMINHO_DO_RECURSO],
        );
      }
    }
  });
});
