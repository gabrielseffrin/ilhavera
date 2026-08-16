/**
 * Geometria do tabuleiro para o SVG.
 *
 * **Nada de trigonometria nova aqui.** O `BoardGraph` já traz o `pixel` de cada
 * hexágono, vértice e aresta, calculado uma vez no motor (§4.3) — os mesmos
 * números que a CLI usa para desenhar em texto. Este módulo só converte esses
 * pontos em atributos de SVG.
 *
 * A consequência prática: tabuleiro do servidor, da CLI e do navegador são
 * geometricamente o mesmo. Se um vértice estiver no lugar errado, está errado
 * nos três, e o teste do motor pega antes.
 */

import { HEX_SIZE, type BoardGraph, type Pixel } from '@ilhavera/rules';

/** Folga em volta do tabuleiro, para o mar e os portos não encostarem na borda. */
const MARGEM = HEX_SIZE * 1.6;

/**
 * Os 6 cantos de um hexágono *pointy-top*, na mesma convenção do motor: o canto
 * 0 aponta para cima, e daí em diante no sentido horário.
 */
export function cantosDoHexagono(centro: Pixel, raio = HEX_SIZE): Pixel[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angulo = (Math.PI / 180) * (60 * i - 90);
    return {
      x: centro.x + raio * Math.cos(angulo),
      y: centro.y + raio * Math.sin(angulo),
    };
  });
}

export function pontosDoPoligono(pontos: readonly Pixel[]): string {
  return pontos.map((p) => `${arredondar(p.x)},${arredondar(p.y)}`).join(' ');
}

/** Duas casas bastam num SVG e evitam `0.30000000000000004` no DOM. */
function arredondar(n: number): number {
  return Math.round(n * 100) / 100;
}

export type Caixa = { minX: number; minY: number; largura: number; altura: number };

/**
 * A caixa que contém o tabuleiro inteiro, com margem.
 *
 * Calculada a partir dos hexágonos, e não fixada à mão: o dia em que o tabuleiro
 * crescer para 5–6 jogadores (§1, extensão prevista), o `viewBox` acompanha
 * sozinho.
 */
export function caixaDoTabuleiro(board: BoardGraph): Caixa {
  const centros = board.hexOrder.map((id) => board.hexes[id]?.pixel).filter(existe);
  if (centros.length === 0) return { minX: 0, minY: 0, largura: 0, altura: 0 };

  const xs = centros.flatMap((p) => [p.x - HEX_SIZE, p.x + HEX_SIZE]);
  const ys = centros.flatMap((p) => [p.y - HEX_SIZE, p.y + HEX_SIZE]);

  const minX = Math.min(...xs) - MARGEM;
  const minY = Math.min(...ys) - MARGEM;

  return {
    minX: arredondar(minX),
    minY: arredondar(minY),
    largura: arredondar(Math.max(...xs) + MARGEM - minX),
    altura: arredondar(Math.max(...ys) + MARGEM - minY),
  };
}

export function viewBox(caixa: Caixa): string {
  return `${caixa.minX} ${caixa.minY} ${caixa.largura} ${caixa.altura}`;
}

/**
 * Para onde aponta um porto: do centro do tabuleiro para fora, passando pelo
 * vértice. É o que coloca o rótulo do porto no mar em vez de em cima da ilha.
 */
export function direcaoParaFora(ponto: Pixel, centro: Pixel): Pixel {
  const dx = ponto.x - centro.x;
  const dy = ponto.y - centro.y;
  const comprimento = Math.hypot(dx, dy);

  // O centro exato do tabuleiro não é vértice de nada, mas a guarda evita
  // divisão por zero virar `NaN` no atributo do SVG.
  if (comprimento === 0) return { x: 0, y: -1 };
  return { x: dx / comprimento, y: dy / comprimento };
}

export function centroDoTabuleiro(caixa: Caixa): Pixel {
  return { x: caixa.minX + caixa.largura / 2, y: caixa.minY + caixa.altura / 2 };
}

function existe<T>(valor: T | undefined): valor is T {
  return valor !== undefined;
}
