/**
 * Rolagem e produção de recursos — §3.3 do roadmap, incluindo a regra de
 * escassez do banco, que é um dos casos de borda catalogados em §8.
 */
import { describe, expect, it } from 'vitest';

import { produceResources } from '../src/actions/roll.js';
import { TERRAIN_PRODUCES } from '../src/types.js';
import { patch, newGame, completeSetup, expectError, apply } from './helpers/setup.js';
import {
  clearBuildingsOnHex,
  findProductiveHex,
  hexVertices,
  placeBuilding,
} from './helpers/board.js';
import { produce } from 'immer';
import type { GameEvent } from '../src/state.js';

/** Roda a produção isolada, sem passar pelos dados. */
function produzir(state: ReturnType<typeof newGame>, total: number) {
  const events: GameEvent[] = [];
  const next = produce(state, (draft) => {
    produceResources(draft, total, (e) => events.push(e));
  });
  return { state: next, events };
}

describe('produção de recursos', () => {
  it('dá 1 recurso por assentamento adjacente', () => {
    let s = completeSetup(newGame());
    const hexId = findProductiveHex(s, 'forest');
    const hex = s.board.hexes[hexId]!;
    const vertexId = hexVertices(s, hexId).find((v) => s.buildings[v] === undefined)!;

    s = placeBuilding(s, 'ana', vertexId, 'settlement');
    const antes = s.players.find((p) => p.id === 'ana')!.resources.lumber;

    const { state } = produzir(s, hex.number!);
    expect(state.players.find((p) => p.id === 'ana')!.resources.lumber).toBe(antes + 1);
  });

  it('dá 2 recursos por cidade adjacente', () => {
    let s = completeSetup(newGame());
    const hexId = findProductiveHex(s, 'mountain');
    const hex = s.board.hexes[hexId]!;
    const vertexId = hexVertices(s, hexId).find((v) => s.buildings[v] === undefined)!;

    s = placeBuilding(s, 'ana', vertexId, 'city');
    const antes = s.players.find((p) => p.id === 'ana')!.resources.ore;

    const { state } = produzir(s, hex.number!);
    expect(state.players.find((p) => p.id === 'ana')!.resources.ore).toBe(antes + 2);
  });

  it('não produz no hexágono ocupado pelo Saqueador', () => {
    let s = completeSetup(newGame());
    const hexId = findProductiveHex(s, 'field');
    const hex = s.board.hexes[hexId]!;
    const vertexId = hexVertices(s, hexId).find((v) => s.buildings[v] === undefined)!;

    s = placeBuilding(s, 'ana', vertexId, 'settlement');
    s = patch(s, (draft) => {
      draft.robberHex = hexId;
    });
    const antes = s.players.find((p) => p.id === 'ana')!.resources.grain;

    const { state } = produzir(s, hex.number!);
    expect(state.players.find((p) => p.id === 'ana')!.resources.grain).toBe(antes);
  });

  it('nunca produz no deserto', () => {
    expect(TERRAIN_PRODUCES.desert).toBeNull();
  });

  it('debita o banco exatamente o que distribuiu', () => {
    let s = completeSetup(newGame());
    const hexId = findProductiveHex(s, 'pasture');
    const hex = s.board.hexes[hexId]!;
    const vertexId = hexVertices(s, hexId).find((v) => s.buildings[v] === undefined)!;
    s = placeBuilding(s, 'ana', vertexId, 'settlement');

    const bancoAntes = s.bank.wool;
    const { state } = produzir(s, hex.number!);
    const ganho = state.players.find((p) => p.id === 'ana')!.resources.wool -
      s.players.find((p) => p.id === 'ana')!.resources.wool;
    expect(state.bank.wool).toBe(bancoAntes - ganho);
  });

  describe('escassez do banco (§3.3)', () => {
    it('com beneficiário único, ele leva o que houver', () => {
      let s = completeSetup(newGame());
      const hexId = findProductiveHex(s, 'hill');
      const hex = s.board.hexes[hexId]!;
      // O setup espalha assentamentos: limpa o hexágono para haver exatamente
      // um beneficiário, que é o cenário sob teste.
      s = clearBuildingsOnHex(s, hexId);
      const vertexId = hexVertices(s, hexId)[0]!;

      // Cidade quer 2 tijolos, mas só há 1 no banco.
      s = placeBuilding(s, 'ana', vertexId, 'city');
      s = patch(s, (draft) => {
        draft.players.find((p) => p.id === 'bruno')!.resources.brick += draft.bank.brick - 1;
        draft.bank.brick = 1;
      });

      const antes = s.players.find((p) => p.id === 'ana')!.resources.brick;
      const { state, events } = produzir(s, hex.number!);

      expect(state.players.find((p) => p.id === 'ana')!.resources.brick).toBe(antes + 1);
      expect(state.bank.brick).toBe(0);
      const evento = events.find((e) => e.type === 'resourcesProduced');
      expect(evento?.type === 'resourcesProduced' && evento.data.blockedByBank).toContain('brick');
    });

    it('com vários beneficiários e banco insuficiente, NINGUÉM recebe', () => {
      let s = completeSetup(newGame());
      const hexId = findProductiveHex(s, 'forest');
      const hex = s.board.hexes[hexId]!;
      s = clearBuildingsOnHex(s, hexId);
      const livres = hexVertices(s, hexId);

      // Dois jogadores com direito, 1 carta no banco: a regra é tudo ou nada.
      s = placeBuilding(s, 'ana', livres[0]!, 'settlement');
      s = placeBuilding(s, 'bruno', livres[2]!, 'settlement');
      s = patch(s, (draft) => {
        draft.players.find((p) => p.id === 'carla')!.resources.lumber += draft.bank.lumber - 1;
        draft.bank.lumber = 1;
      });

      const anaAntes = s.players.find((p) => p.id === 'ana')!.resources.lumber;
      const brunoAntes = s.players.find((p) => p.id === 'bruno')!.resources.lumber;

      const { state, events } = produzir(s, hex.number!);

      expect(state.players.find((p) => p.id === 'ana')!.resources.lumber).toBe(anaAntes);
      expect(state.players.find((p) => p.id === 'bruno')!.resources.lumber).toBe(brunoAntes);
      expect(state.bank.lumber).toBe(1);

      const evento = events.find((e) => e.type === 'resourcesProduced');
      expect(evento?.type === 'resourcesProduced' && evento.data.blockedByBank).toContain('lumber');
    });

    it('bloqueia só o recurso escasso, não a rodada inteira', () => {
      let s = completeSetup(newGame());
      // Um hexágono de floresta e um de pasto com o MESMO número.
      const alvo = s.board.hexOrder.find((h) => {
        const hex = s.board.hexes[h]!;
        return hex.terrain === 'forest' && hex.number !== null;
      })!;
      const numero = s.board.hexes[alvo]!.number!;

      s = patch(s, (draft) => {
        // Força outro hexágono produtivo com o mesmo número, de outro terreno.
        const outro = draft.board.hexOrder.find(
          (h) => h !== alvo && draft.board.hexes[h]!.terrain === 'pasture',
        )!;
        draft.board.hexes[outro]!.number = numero;
        draft.robberHex = draft.board.hexOrder.find(
          (h) => h !== alvo && h !== outro && draft.board.hexes[h]!.terrain === 'desert',
        )!;
      });

      const pasto = s.board.hexOrder.find(
        (h) => s.board.hexes[h]!.terrain === 'pasture' && s.board.hexes[h]!.number === numero,
      )!;

      s = clearBuildingsOnHex(s, alvo);
      s = clearBuildingsOnHex(s, pasto);
      const livresFloresta = hexVertices(s, alvo);
      const livresPasto = hexVertices(s, pasto).filter((v) => !livresFloresta.includes(v));

      s = placeBuilding(s, 'ana', livresFloresta[0]!, 'settlement');
      s = placeBuilding(s, 'bruno', livresFloresta[2]!, 'settlement');
      s = placeBuilding(s, 'carla', livresPasto[0]!, 'settlement');
      s = patch(s, (draft) => {
        draft.players.find((p) => p.id === 'davi')!.resources.lumber += draft.bank.lumber - 1;
        draft.bank.lumber = 1;
      });

      const carlaAntes = s.players.find((p) => p.id === 'carla')!.resources.wool;
      const { state } = produzir(s, numero);

      // Madeira travou; lã foi entregue normalmente.
      expect(state.bank.lumber).toBe(1);
      expect(state.players.find((p) => p.id === 'carla')!.resources.wool).toBe(carlaAntes + 1);
    });
  });
});

describe('rolagem', () => {
  it('exige a rolagem antes do turno principal', () => {
    const s = completeSetup(newGame());
    expectError(s, { type: 'endTurn', player: 'ana' }, 'INVALID_PHASE');
  });

  it('vai para a fase principal quando o resultado não é 7', () => {
    const s = completeSetup(newGame());
    // Procura um cursor cuja rolagem não some 7.
    let tentativa = 0;
    while (tentativa < 50) {
      const teste = apply(patch(s, (d) => { d.rngCursor = tentativa; }), {
        type: 'rollDice',
        player: 'ana',
      });
      if (teste.lastRoll!.total !== 7) {
        expect(teste.phase).toBe('main');
        expect(teste.rngCursor).toBe(tentativa + 2);
        return;
      }
      tentativa++;
    }
    throw new Error('não encontrei rolagem diferente de 7');
  });

  it('avança o cursor do PRNG em 2 a cada rolagem', () => {
    const s = completeSetup(newGame());
    const antes = s.rngCursor;
    const depois = apply(s, { type: 'rollDice', player: 'ana' });
    expect(depois.rngCursor).toBe(antes + 2);
  });

  it('rejeita rolagem de quem não é da vez', () => {
    const s = completeSetup(newGame());
    expectError(s, { type: 'rollDice', player: 'bruno' }, 'NOT_YOUR_TURN');
  });

  it('rejeita rolar duas vezes no mesmo turno', () => {
    let s = completeSetup(newGame());
    s = apply(s, { type: 'rollDice', player: 'ana' });
    if (s.phase === 'main') {
      expectError(s, { type: 'rollDice', player: 'ana' }, 'INVALID_PHASE');
    }
  });
});
