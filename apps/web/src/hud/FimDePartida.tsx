/**
 * O anúncio do vencedor.
 *
 * Deliberadamente magro: a tela de fim de partida com placar detalhado é item
 * da Fase 5 do roadmap, e antecipá-la seria inventar escopo. Mas sem *algum*
 * fim visível, "partida completa jogável" não tem como ser verdade — a mesa
 * simplesmente para de aceitar jogadas e ninguém entende por quê.
 */

import type { ClientView } from '@ilhavera/rules';

import { COR_DO_JOGADOR, CONTORNO_DO_JOGADOR } from '../board/cores.js';

export type FimDePartidaProps = {
  mesa: ClientView;
};

export function FimDePartida({ mesa }: FimDePartidaProps): React.JSX.Element | null {
  if (mesa.winner === null) return null;

  const vencedor = mesa.players.find((p) => p.id === mesa.winner);
  if (vencedor === undefined) return null;

  return (
    <p
      data-testid="fim-de-partida"
      data-vencedor={vencedor.id}
      className="flex items-center gap-2 rounded-xl bg-amber-300 px-3 py-2 text-sm font-semibold text-amber-950"
    >
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-full border"
        style={{
          backgroundColor: COR_DO_JOGADOR[vencedor.color],
          borderColor: CONTORNO_DO_JOGADOR[vencedor.color],
        }}
      />
      🏆 {vencedor.name} venceu com {vencedor.victoryPointsPublic} pontos de vitória.
    </p>
  );
}
