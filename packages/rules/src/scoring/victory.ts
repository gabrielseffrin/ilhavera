/**
 * Maior Exército, pontos de vitória e condição de vitória — §3.4 do roadmap.
 */

import { MIN_LARGEST_ARMY, type PlayerId } from '../types.js';
import type { GameState } from '../state.js';
import { playerBuildings } from '../query.js';

/**
 * Maior Exército: primeiro a jogar 3 Soldados leva; transfere apenas para quem
 * tiver **estritamente mais**.
 */
export function recomputeLargestArmy(
  state: GameState,
  current: { owner: PlayerId | null; size: number },
): { owner: PlayerId | null; size: number } {
  let best = current;
  for (const p of state.players) {
    if (p.knightsPlayed < MIN_LARGEST_ARMY) continue;
    if (p.knightsPlayed > best.size) {
      best = { owner: p.id, size: p.knightsPlayed };
    }
  }
  return best;
}

export type VictoryBreakdown = {
  settlements: number;
  cities: number;
  largestArmy: number;
  longestRoad: number;
  devCards: number;
  total: number;
};

/**
 * `PV = assentamentos(1) + cidades(2) + Maior Exército(2) + Estrada Mais
 * Longa(2) + cartas de PV(1 cada)`.
 *
 * `includeHidden = false` devolve a pontuação **pública** — a que os
 * adversários enxergam, sem as cartas de Ponto de Vitória.
 */
export function victoryPoints(
  state: GameState,
  playerId: PlayerId,
  includeHidden: boolean,
): VictoryBreakdown {
  let settlements = 0;
  let cities = 0;
  for (const b of playerBuildings(state, playerId)) {
    if (b.type === 'settlement') settlements += 1;
    else cities += 2;
  }

  const largestArmy = state.largestArmy.owner === playerId ? 2 : 0;
  const longestRoad = state.longestRoad.owner === playerId ? 2 : 0;

  let devCards = 0;
  if (includeHidden) {
    const player = state.players.find((p) => p.id === playerId);
    devCards = player?.devCards.filter((c) => c.card === 'victoryPoint').length ?? 0;
  }

  return {
    settlements,
    cities,
    largestArmy,
    longestRoad,
    devCards,
    total: settlements + cities + largestArmy + longestRoad + devCards,
  };
}

/**
 * §3.4: a vitória é verificada **apenas no turno do próprio jogador**. Um
 * jogador pode cruzar os 10 PV por causa de uma jogada alheia (perder a Estrada
 * Mais Longa para um terceiro, por exemplo) e só vencer quando sua vez chegar.
 */
export function hasWon(state: GameState, playerId: PlayerId): boolean {
  return victoryPoints(state, playerId, true).total >= state.settings.targetVictoryPoints;
}

/**
 * O placar de todos os jogadores com as cartas de Ponto de Vitória **reveladas**.
 *
 * Não filtra nada, e é por isso que não pode ser chamada em qualquer momento:
 * quem a usa assume a responsabilidade de só expô-la quando a partida acabou.
 * Hoje há dois desses lugares — `toClientView`, que a inclui apenas com
 * `winner !== null`, e o diário de `game_results` (§7), que só grava no fim.
 *
 * Existe como função própria para que os dois leiam o mesmo placar. O servidor
 * gravar um total e a tela mostrar outro seria o tipo de divergência que só
 * aparece meses depois, quando alguém for conferir por que a estatística não
 * bate com o que a mesa viu.
 */
export function scoreboard(state: GameState): Record<PlayerId, VictoryBreakdown> {
  return Object.fromEntries(state.players.map((p) => [p.id, victoryPoints(state, p.id, true)]));
}
