/**
 * A mão de quem está agindo: recursos, Cartas de Progresso e portos.
 *
 * Só existe quando a projeção traz um `you` — no hot-seat isso é sempre o
 * jogador ativo, e na Fase 4 será quem está logado. Espectador não tem mão, e o
 * painel some em vez de mostrar zeros.
 *
 * A marca de "comprada neste turno" não é decoração: uma Carta de Progresso não
 * pode ser jogada no turno em que foi comprada (§3.3), e sem o aviso o jogador
 * fica clicando num botão que não aparece e culpando a interface.
 */

import {
  DEV_CARD_LABELS,
  RESOURCES,
  RESOURCE_LABELS,
  portLabel,
  type PortType,
  type SelfPlayerView,
} from '@ilhavera/rules';

import { COR_DO_RECURSO } from '../board/cores.js';
import { t } from '../i18n/pt-BR.js';

export type PainelDaMaoProps = {
  voce: SelfPlayerView | null;
  /** Para saber quais cartas ainda estão travadas. */
  turno: number;
};

export function PainelDaMao({ voce, turno }: PainelDaMaoProps): React.JSX.Element | null {
  if (voce === null) return null;

  const cartas = voce.devCards.filter((c) => !c.played);
  const total = RESOURCES.reduce((soma, r) => soma + voce.resources[r], 0);

  return (
    <section
      data-testid="painel-da-mao"
      className="rounded-xl bg-slate-900/70 p-3 text-sm text-white"
    >
      <h2 className="mb-2 flex items-baseline gap-2 font-semibold">
        Mão de {voce.name}
        <span className="text-xs font-normal text-white/60">{total} cartas</span>
      </h2>

      <ul className="flex flex-wrap gap-1.5">
        {RESOURCES.map((r) => (
          <li
            key={r}
            data-recurso={r}
            data-qtd={voce.resources[r]}
            title={RESOURCE_LABELS[r]}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-900"
            style={{
              backgroundColor: COR_DO_RECURSO[r],
              opacity: voce.resources[r] === 0 ? 0.3 : 1,
            }}
          >
            {RESOURCE_LABELS[r]}
            <strong className="tabular-nums">{voce.resources[r]}</strong>
          </li>
        ))}
      </ul>

      <h3 className="mt-3 mb-1 text-xs font-semibold text-white/70">{t.mao.cartasDeProgresso}</h3>
      {cartas.length === 0 ? (
        <p className="text-xs text-white/70">{t.mao.nenhuma}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {cartas.map((c, i) => {
            const travada = c.boughtOnTurn >= turno;
            return (
              <li
                key={`${c.card}-${i}`}
                data-carta={c.card}
                data-travada={travada}
                /* Carta travada é a que não dá para jogar hoje, e isso se diz
                   por escrito ao lado. Apagá-la até o texto sumir seria
                   esconder a informação em vez de qualificá-la. */
                className={`rounded-lg px-2 py-1 text-xs ${
                  travada ? 'bg-white/10 text-white/70' : 'bg-white/90 text-slate-900'
                }`}
              >
                {DEV_CARD_LABELS[c.card]}
                {travada && <span className="ml-1">{t.mao.compradaNesteTurno}</span>}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-xs text-white/70">
        <span className="font-semibold">{t.mao.portos}</span>{' '}
        {voce.ports.length === 0 ? t.mao.nenhum : voce.ports.map(nomeDoPorto).join(', ')}
      </p>
    </section>
  );
}

function nomeDoPorto(port: PortType): string {
  return portLabel(port);
}
