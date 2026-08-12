/**
 * Rolagem de dados e produção de recursos — §3.3 do roadmap.
 */

import type { ErrorCode } from '../errors.js';
import type { GameState } from '../state.js';
import {
  DISCARD_THRESHOLD,
  RESOURCES,
  TERRAIN_PRODUCES,
  emptyResourceCount,
  type PlayerId,
  type Resource,
  type ResourceCount,
} from '../types.js';
import { countResources } from '../query.js';
import { rollDice } from '../rng.js';
import type { Emit } from './kit.js';
import type { ActionOf } from './types.js';

export function validateRollDice(
  _state: GameState,
  _action: ActionOf<'rollDice'>,
): ErrorCode | null {
  return null;
}

export function applyRollDice(draft: GameState, action: ActionOf<'rollDice'>, emit: Emit): void {
  const roll = rollDice(draft.seed, draft.rngCursor);
  draft.rngCursor = roll.cursor;
  draft.lastRoll = { dice: roll.dice, total: roll.total };

  emit({
    type: 'diceRolled',
    actor: action.player,
    data: { dice: roll.dice, total: roll.total },
  });

  if (roll.total === 7) {
    startRobberPhase(draft, emit);
    return;
  }

  produceResources(draft, roll.total, emit);
  draft.phase = 'main';
}

/**
 * §3.3: quem tem 8+ cartas descarta metade (arredondando para baixo). Os
 * descartes acontecem em paralelo e o turno só prossegue quando todos
 * confirmarem — por isso a fase própria `discarding`.
 */
function startRobberPhase(draft: GameState, emit: Emit): void {
  draft.robberReturnPhase = 'main';

  const counts: Record<PlayerId, number> = {};
  for (const p of draft.players) {
    const total = countResources(p.resources);
    if (total >= DISCARD_THRESHOLD) counts[p.id] = Math.floor(total / 2);
  }

  draft.pendingDiscards = counts;

  if (Object.keys(counts).length === 0) {
    draft.phase = 'movingRobber';
    return;
  }

  draft.phase = 'discarding';
  emit({ type: 'discardRequired', data: { counts } });
}

/**
 * Produção: cada hexágono com a ficha rolada e **sem Saqueador** produz 1
 * recurso por assentamento adjacente e 2 por cidade adjacente.
 *
 * Escassez do banco (§3.3): se o banco não tiver cartas suficientes de um
 * recurso para atender todos os jogadores com direito, **ninguém** recebe
 * aquele recurso — exceto se apenas um jogador tiver direito, caso em que ele
 * recebe o que houver.
 */
export function produceResources(draft: GameState, total: number, emit: Emit): void {
  const demand: Record<PlayerId, ResourceCount> = {};
  for (const p of draft.players) demand[p.id] = emptyResourceCount();

  for (const hexId of draft.board.hexOrder) {
    const hex = draft.board.hexes[hexId];
    if (hex === undefined) continue;
    if (hex.number !== total) continue;
    if (hexId === draft.robberHex) continue;

    const resource = TERRAIN_PRODUCES[hex.terrain];
    if (resource === null) continue;

    for (const vertexId of hex.vertices) {
      const building = draft.buildings[vertexId];
      if (building === undefined) continue;
      const target = demand[building.owner];
      if (target === undefined) continue;
      target[resource] += building.type === 'city' ? 2 : 1;
    }
  }

  const gains: Record<PlayerId, ResourceCount> = {};
  const blockedByBank: Resource[] = [];

  for (const resource of RESOURCES) {
    const beneficiaries = draft.players.filter(
      (p) => (demand[p.id] as ResourceCount)[resource] > 0,
    );
    if (beneficiaries.length === 0) continue;

    const totalDemand = beneficiaries.reduce(
      (sum, p) => sum + (demand[p.id] as ResourceCount)[resource],
      0,
    );

    if (totalDemand <= draft.bank[resource]) {
      for (const p of beneficiaries) {
        const amount = (demand[p.id] as ResourceCount)[resource];
        p.resources[resource] += amount;
        draft.bank[resource] -= amount;
        (gains[p.id] ??= emptyResourceCount())[resource] += amount;
      }
      continue;
    }

    if (beneficiaries.length === 1) {
      // Beneficiário único: leva o que houver.
      const p = beneficiaries[0] as (typeof beneficiaries)[number];
      const amount = draft.bank[resource];
      if (amount > 0) {
        p.resources[resource] += amount;
        draft.bank[resource] -= amount;
        (gains[p.id] ??= emptyResourceCount())[resource] += amount;
      }
      if (amount < totalDemand) blockedByBank.push(resource);
      continue;
    }

    // Vários com direito e banco insuficiente: ninguém recebe.
    blockedByBank.push(resource);
  }

  emit({ type: 'resourcesProduced', data: { gains, blockedByBank } });
}
