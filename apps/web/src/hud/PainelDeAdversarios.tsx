/**
 * O que se sabe de cada jogador sem olhar a mão dele.
 *
 * Tudo aqui vem de `PublicPlayerView`, e isso não é conveniência: é a mesma
 * fronteira de §4.5 valendo dentro do navegador. O ponto sensível é a pontuação
 * — `victoryPointsPublic` **exclui** as cartas de Ponto de Vitória ocultas.
 * Mostrar o total refaria no cliente exatamente o vazamento que `toClientView`
 * existe para impedir, e a partida perderia o blefe que a carta de PV oculta
 * carrega desde §3.3.
 */

import {
  LARGEST_ARMY_LABEL,
  LONGEST_ROAD_LABEL,
  type ClientView,
  type PlayerId,
} from '@ilhavera/rules';

import { COR_DO_JOGADOR, CONTORNO_DO_JOGADOR } from '../board/cores.js';

export type PainelDeAdversariosProps = {
  mesa: ClientView;
  /** Quem precisa agir agora — nem sempre o jogador da vez. */
  ativo: PlayerId | null;
};

export function PainelDeAdversarios({ mesa, ativo }: PainelDeAdversariosProps): React.JSX.Element {
  const daVez = mesa.players[mesa.currentPlayerIndex]?.id ?? null;

  return (
    <section
      data-testid="painel-de-adversarios"
      className="rounded-xl bg-slate-900/70 p-3 text-sm text-white"
    >
      <h2 className="mb-2 font-semibold">Jogadores</h2>

      <ul className="flex flex-col gap-1.5">
        {mesa.players.map((p) => {
          const devendo = mesa.pendingDiscards[p.id] ?? 0;

          return (
            <li
              key={p.id}
              data-jogador={p.id}
              data-pv={p.victoryPointsPublic}
              className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-2 py-1 text-xs ${
                p.id === ativo ? 'bg-white/15' : ''
              }`}
            >
              <span
                aria-hidden
                className="inline-block h-3 w-3 shrink-0 rounded-full border"
                style={{
                  backgroundColor: COR_DO_JOGADOR[p.color],
                  borderColor: CONTORNO_DO_JOGADOR[p.color],
                }}
              />
              <span className="font-medium">{p.name}</span>
              {p.id === daVez && (
                <span className="text-white/60" title="jogador da vez">
                  ▶
                </span>
              )}

              <span className="ml-auto tabular-nums" title="pontos de vitória públicos">
                {p.victoryPointsPublic} PV
              </span>
              <span className="tabular-nums text-white/70" title="cartas de recurso">
                {p.resourceCount}🂠
              </span>
              <span className="tabular-nums text-white/70" title="Cartas de Progresso">
                {p.devCardCount}✦
              </span>
              <span className="tabular-nums text-white/70" title="Soldados jogados">
                {p.knightsPlayed}⚔
              </span>
              <span
                className="tabular-nums text-white/50"
                title="peças restantes: estradas / assentamentos / cidades"
              >
                {p.piecesLeft.roads}/{p.piecesLeft.settlements}/{p.piecesLeft.cities}
              </span>

              {mesa.longestRoad.owner === p.id && (
                <Selo titulo={`${LONGEST_ROAD_LABEL} (${mesa.longestRoad.length})`}>Estrada</Selo>
              )}
              {mesa.largestArmy.owner === p.id && (
                <Selo titulo={`${LARGEST_ARMY_LABEL} (${mesa.largestArmy.size})`}>Exército</Selo>
              )}
              {devendo > 0 && (
                <Selo titulo={`precisa descartar ${devendo} cartas`}>descartando {devendo}</Selo>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Selo({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <span
      title={titulo}
      className="rounded bg-amber-300/90 px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber-950"
    >
      {children}
    </span>
  );
}
