/**
 * Rótulos e códigos de erro.
 *
 * Parece teste de constante, mas pega uma classe real de bug: acrescentar um
 * recurso, terreno ou carta ao domínio e esquecer o rótulo — a UI passaria a
 * mostrar `undefined` em produção. O `Record` completo obriga o TypeScript a
 * cobrir a união, e estes testes garantem que ninguém "resolveu" isso com um
 * texto vazio.
 */
import { describe, expect, it } from 'vitest';

import {
  DEV_CARDS,
  DEV_CARD_DISTRIBUTION,
  NUMBER_TOKENS,
  PORT_DISTRIBUTION,
  RESOURCES,
  TERRAINS,
  TERRAIN_DISTRIBUTION,
  TERRAIN_PRODUCES,
  emptyResourceCount,
  totalResources,
} from '../src/types.js';
import {
  DEV_CARD_LABELS,
  LARGEST_ARMY_LABEL,
  LONGEST_ROAD_LABEL,
  RESOURCE_LABELS,
  ROBBER_LABEL,
  TERRAIN_LABELS,
  portLabel,
} from '../src/labels.js';
import { ERROR_CODES } from '../src/errors.js';

describe('rótulos em pt-BR', () => {
  it('tem rótulo não vazio para todo recurso, terreno e carta', () => {
    for (const r of RESOURCES) expect(RESOURCE_LABELS[r].length).toBeGreaterThan(0);
    for (const t of TERRAINS) expect(TERRAIN_LABELS[t].length).toBeGreaterThan(0);
    for (const c of DEV_CARDS) expect(DEV_CARD_LABELS[c].length).toBeGreaterThan(0);
  });

  it('usa a terminologia própria exigida por §2', () => {
    expect(RESOURCE_LABELS).toEqual({
      lumber: 'Madeira',
      brick: 'Tijolo',
      wool: 'Lã',
      grain: 'Trigo',
      ore: 'Minério',
    });
    expect(DEV_CARD_LABELS.knight).toBe('Soldado');
    expect(ROBBER_LABEL).toBe('Saqueador');
    expect(LONGEST_ROAD_LABEL).toBe('Estrada Mais Longa');
    expect(LARGEST_ARMY_LABEL).toBe('Maior Exército');
  });

  it('descreve portos genéricos e específicos', () => {
    expect(portLabel('generic')).toBe('Porto 3:1');
    expect(portLabel('ore')).toBe('Porto 2:1 Minério');
  });

  it('não repete rótulos entre recursos nem entre terrenos', () => {
    expect(new Set(Object.values(RESOURCE_LABELS)).size).toBe(RESOURCES.length);
    expect(new Set(Object.values(TERRAIN_LABELS)).size).toBe(TERRAINS.length);
  });
});

describe('constantes do domínio', () => {
  it('soma 19 terrenos e 18 fichas numéricas', () => {
    expect(Object.values(TERRAIN_DISTRIBUTION).reduce((a, b) => a + b, 0)).toBe(19);
    expect(NUMBER_TOKENS).toHaveLength(18);
    // Uma ficha por hexágono, exceto o deserto.
    expect(NUMBER_TOKENS.length).toBe(19 - TERRAIN_DISTRIBUTION.desert);
  });

  it('soma 25 Cartas de Progresso', () => {
    expect(Object.values(DEV_CARD_DISTRIBUTION).reduce((a, b) => a + b, 0)).toBe(25);
  });

  it('tem 9 portos: 4 genéricos e 1 específico por recurso', () => {
    expect(PORT_DISTRIBUTION).toHaveLength(9);
    expect(PORT_DISTRIBUTION.filter((p) => p === 'generic')).toHaveLength(4);
    for (const r of RESOURCES) {
      expect(PORT_DISTRIBUTION.filter((p) => p === r)).toHaveLength(1);
    }
  });

  it('faz todo terreno produzir um recurso, menos o deserto', () => {
    for (const t of TERRAINS) {
      if (t === 'desert') expect(TERRAIN_PRODUCES[t]).toBeNull();
      else expect(RESOURCES).toContain(TERRAIN_PRODUCES[t]);
    }
    // Cada recurso vem de exatamente um terreno.
    const produzidos = TERRAINS.map((t) => TERRAIN_PRODUCES[t]).filter((r) => r !== null);
    expect(new Set(produzidos).size).toBe(RESOURCES.length);
  });

  it('emptyResourceCount começa zerado e totalResources soma', () => {
    const vazio = emptyResourceCount();
    expect(totalResources(vazio)).toBe(0);
    for (const r of RESOURCES) expect(vazio[r]).toBe(0);

    vazio.ore = 3;
    vazio.wool = 2;
    expect(totalResources(vazio)).toBe(5);
  });
});

describe('códigos de erro', () => {
  it('inclui todos os códigos citados em §5.3 do roadmap', () => {
    const doRoadmap = [
      'NOT_YOUR_TURN',
      'INVALID_PHASE',
      'INSUFFICIENT_RESOURCES',
      'DISTANCE_RULE_VIOLATION',
      'VERTEX_OCCUPIED',
      'ROAD_NOT_CONNECTED',
      'NO_PIECES_LEFT',
      'DEV_CARD_ALREADY_PLAYED',
      'DEV_CARD_BOUGHT_THIS_TURN',
      'ROBBER_SAME_HEX',
      'BANK_DEPLETED',
      'TRADE_EXPIRED',
    ];
    for (const code of doRoadmap) expect(ERROR_CODES).toContain(code);
  });

  it('não tem código duplicado', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
