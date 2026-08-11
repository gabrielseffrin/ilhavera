/**
 * O PRNG sustenta a promessa central de §4.1: replay determinístico. Se ele
 * não for reproduzível e saltável, nada mais do event sourcing funciona.
 */
import { describe, expect, it } from 'vitest';

import { draw, pick, randomInt, rollDice, shuffle } from '../src/rng.js';

describe('PRNG semeado', () => {
  it('é determinístico para a mesma seed e cursor', () => {
    expect(draw('a', 10)).toEqual(draw('a', 10));
    expect(rollDice('partida', 42)).toEqual(rollDice('partida', 42));
  });

  it('dá sequências diferentes para seeds diferentes', () => {
    const a = Array.from({ length: 20 }, (_, i) => draw('seed-a', i).value);
    const b = Array.from({ length: 20 }, (_, i) => draw('seed-b', i).value);
    expect(a).not.toEqual(b);
  });

  it('separa bem seeds vizinhas', () => {
    // Seeds parecidas são o caso real: "sala-1", "sala-2"...
    const a = Array.from({ length: 10 }, (_, i) => draw('sala-1', i).value);
    const b = Array.from({ length: 10 }, (_, i) => draw('sala-2', i).value);
    expect(a).not.toEqual(b);
  });

  it('é counter-based: saltar para o cursor N dá o mesmo que avançar N vezes', () => {
    // É esta propriedade que permite restaurar uma partida de um snapshot sem
    // reexecutar o fluxo inteiro do PRNG.
    let cursor = 0;
    for (let i = 0; i < 50; i++) cursor = draw('salto', cursor).cursor;
    expect(cursor).toBe(50);
    expect(draw('salto', 50).value).toBe(draw('salto', 50).value);
  });

  it('produz valores em [0, 1)', () => {
    for (let i = 0; i < 2000; i++) {
      const v = draw('faixa', i).value;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('mantém randomInt dentro da faixa e avançando o cursor', () => {
    for (let i = 0; i < 500; i++) {
      const r = randomInt('faixa-int', i, 6);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(6);
      expect(r.cursor).toBe(i + 1);
    }
  });

  it('rejeita randomInt com faixa vazia', () => {
    expect(() => randomInt('x', 0, 0)).toThrow();
    expect(() => pick('x', 0, [])).toThrow();
  });

  describe('dados', () => {
    it('gera dois dados de 1 a 6 e consome 2 posições do cursor', () => {
      for (let i = 0; i < 500; i++) {
        const roll = rollDice('dados', i);
        expect(roll.dice[0]).toBeGreaterThanOrEqual(1);
        expect(roll.dice[0]).toBeLessThanOrEqual(6);
        expect(roll.dice[1]).toBeGreaterThanOrEqual(1);
        expect(roll.dice[1]).toBeLessThanOrEqual(6);
        expect(roll.total).toBe(roll.dice[0] + roll.dice[1]);
        expect(roll.cursor).toBe(i + 2);
      }
    });

    it('tem distribuição triangular, não uniforme', () => {
      // Erro clássico: sortear um número de 2 a 12 direto. Isso mudaria o jogo
      // inteiro — o 7 tem que ser ~6x mais provável que o 2.
      const contagem = new Map<number, number>();
      const N = 200_000;
      let cursor = 0;
      for (let i = 0; i < N; i++) {
        const roll = rollDice('distribuicao', cursor);
        cursor = roll.cursor;
        contagem.set(roll.total, (contagem.get(roll.total) ?? 0) + 1);
      }
      const p = (n: number): number => (contagem.get(n) ?? 0) / N;

      expect(p(7)).toBeGreaterThan(0.15);
      expect(p(7)).toBeLessThan(0.18);
      expect(p(2)).toBeGreaterThan(0.02);
      expect(p(2)).toBeLessThan(0.035);
      expect(p(2)).toBeCloseTo(p(12), 2);
      expect(p(6)).toBeCloseTo(p(8), 2);
      // Nenhum resultado impossível ou fora da faixa.
      expect([...contagem.keys()].sort((a, b) => a - b)).toEqual([
        2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      ]);
    });

    it('não enviesa por face: cada dado é aproximadamente uniforme', () => {
      const faces = new Map<number, number>();
      const N = 100_000;
      let cursor = 0;
      for (let i = 0; i < N; i++) {
        const roll = rollDice('faces', cursor);
        cursor = roll.cursor;
        for (const d of roll.dice) faces.set(d, (faces.get(d) ?? 0) + 1);
      }
      for (const face of [1, 2, 3, 4, 5, 6]) {
        expect((faces.get(face) ?? 0) / (N * 2)).toBeCloseTo(1 / 6, 2);
      }
    });
  });

  describe('embaralhamento', () => {
    it('preserva os elementos', () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const { items } = shuffle('baralho', 0, original);
      expect([...items].sort((a, b) => a - b)).toEqual(original);
    });

    it('não muta a lista de entrada', () => {
      const original = [1, 2, 3, 4, 5];
      shuffle('imutavel', 0, original);
      expect(original).toEqual([1, 2, 3, 4, 5]);
    });

    it('consome n-1 posições do cursor', () => {
      const { cursor } = shuffle('cursor', 100, [1, 2, 3, 4, 5]);
      expect(cursor).toBe(104);
    });

    it('embaralha de verdade e de forma reproduzível', () => {
      const original = Array.from({ length: 25 }, (_, i) => i);
      const a = shuffle('mistura', 0, original).items;
      const b = shuffle('mistura', 0, original).items;
      expect(a).toEqual(b);
      expect(a).not.toEqual(original);
    });

    it('lida com listas triviais', () => {
      expect(shuffle('vazio', 0, []).items).toEqual([]);
      expect(shuffle('unico', 0, ['x']).items).toEqual(['x']);
    });
  });
});
