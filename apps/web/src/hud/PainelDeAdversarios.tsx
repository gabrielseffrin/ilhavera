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

import { IconeDoJogador } from '../board/Marca.js';
import { Cartao } from './base/Cartao.js';
import { IconeDeSimbolo } from './icones/IconeDeSimbolo.js';
import { t } from '../i18n/pt-BR.js';

export type PainelDeAdversariosProps = {
  mesa: ClientView;
  /** Quem precisa agir agora — nem sempre o jogador da vez. */
  ativo: PlayerId | null;
};

export function PainelDeAdversarios({ mesa, ativo }: PainelDeAdversariosProps): React.JSX.Element {
  const daVez = mesa.players[mesa.currentPlayerIndex]?.id ?? null;

  return (
    <Cartao data-testid="painel-de-adversarios">
      <h2 className="mb-2 font-semibold">{t.jogadores.titulo}</h2>

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
              {/* A mesma marca que as peças dele levam no tabuleiro: é assim
                  que se liga "aquela estrada" a "aquele nome" sem depender de
                  distinguir vermelho de verde. */}
              <IconeDoJogador cor={p.color} tamanho={13} />
              <span className="font-medium">{p.name}</span>
              {p.id === daVez && (
                <span className="text-white/70" title={t.jogadores.jogadorDaVez}>
                  <IconeDeSimbolo simbolo="vez" tamanho={9} />
                </span>
              )}

              <span className="ml-auto tabular-nums" title={t.jogadores.pvPublicos}>
                {p.victoryPointsPublic} PV
              </span>
              {/* Dorso genérico nas duas contagens: quantas, nunca quais. Trocar
                  por ícone de recurso refaria aqui o vazamento que
                  `toClientView` fecha — e `paineis.test.tsx` falha se o nome de
                  um recurso aparecer nesta linha. */}
              <span
                className="flex items-center gap-0.5 tabular-nums text-white/70"
                title={t.jogadores.cartasDeRecurso}
              >
                {p.resourceCount}
                <IconeDeSimbolo simbolo="carta" tamanho={11} />
              </span>
              <span
                className="flex items-center gap-0.5 tabular-nums text-white/70"
                title={t.jogadores.cartasDeProgresso}
              >
                {p.devCardCount}
                <IconeDeSimbolo simbolo="progresso" tamanho={11} />
              </span>
              <span
                className="flex items-center gap-0.5 tabular-nums text-white/70"
                title={t.jogadores.soldadosJogados}
              >
                {p.knightsPlayed}
                <IconeDeSimbolo simbolo="knight" tamanho={11} />
              </span>
              {/* `/50` media ~4,2:1 contra o fundo do painel, abaixo do piso
                  de 4,5:1 — e este texto é dos menores da tela. */}
              <span className="tabular-nums text-white/70" title={t.jogadores.pecasRestantes}>
                {p.piecesLeft.roads}/{p.piecesLeft.settlements}/{p.piecesLeft.cities}
              </span>

              {mesa.longestRoad.owner === p.id && (
                <Selo titulo={`${LONGEST_ROAD_LABEL} (${mesa.longestRoad.length})`}>
                  {t.jogadores.seloEstrada}
                </Selo>
              )}
              {mesa.largestArmy.owner === p.id && (
                <Selo titulo={`${LARGEST_ARMY_LABEL} (${mesa.largestArmy.size})`}>
                  {t.jogadores.seloExercito}
                </Selo>
              )}
              {devendo > 0 && (
                <Selo titulo={t.jogadores.descartando(devendo)}>descartando {devendo}</Selo>
              )}
            </li>
          );
        })}
      </ul>
    </Cartao>
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
