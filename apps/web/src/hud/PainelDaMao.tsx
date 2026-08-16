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
import { Cartao } from './base/Cartao.js';
import { IconeDeRecurso } from './icones/IconeDeRecurso.js';
import { IconeDeSimbolo } from './icones/IconeDeSimbolo.js';
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
    <Cartao data-testid="painel-da-mao">
      <h2 className="mb-2 flex items-baseline gap-2 font-semibold">
        Mão de {voce.name}
        <span className="text-xs font-normal text-white/60">{total} cartas</span>
      </h2>

      {/**
       * Carta, e não pílula de texto: proporção em pé, ícone em cima, a
       * quantidade como a coisa maior. A quantidade é o que se lê dezenas de
       * vezes por partida — "tenho trigo para a cidade?" —, e antes ela era o
       * menor caractere da linha.
       *
       * Recurso zerado continua na fila, apagado: sumir mudaria a posição dos
       * outros a cada rolagem, e a mão é justamente onde a memória muscular
       * importa. A sombra só aparece com duas ou mais, e é o que dá a pilha sem
       * custar um nó por carta.
       */}
      <ul className="flex flex-wrap gap-1.5">
        {RESOURCES.map((r) => {
          const quantas = voce.resources[r];
          return (
            <li
              key={r}
              data-recurso={r}
              data-qtd={quantas}
              title={RESOURCE_LABELS[r]}
              className="flex w-12 flex-col items-center gap-0.5 rounded-controle px-1 pt-1.5 pb-1 text-slate-900"
              style={{
                backgroundColor: COR_DO_RECURSO[r],
                opacity: quantas === 0 ? 0.3 : 1,
                boxShadow: quantas > 1 ? '2px 2px 0 0 rgb(0 0 0 / 0.25)' : 'none',
              }}
            >
              <IconeDeRecurso recurso={r} tamanho={17} />
              <strong className="text-sm leading-none tabular-nums">{quantas}</strong>
              <span className="text-[0.6rem] leading-none">{RESOURCE_LABELS[r]}</span>
            </li>
          );
        })}
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
                className={`flex items-center gap-1 rounded-controle px-2 py-1 text-xs ${
                  travada ? 'bg-white/10 text-white/70' : 'bg-white/90 text-slate-900'
                }`}
              >
                <IconeDeSimbolo simbolo={c.card} tamanho={13} />
                {DEV_CARD_LABELS[c.card]}
                {travada && <span>{t.mao.compradaNesteTurno}</span>}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-xs text-white/70">
        <span className="font-semibold">{t.mao.portos}</span>{' '}
        {voce.ports.length === 0 ? t.mao.nenhum : voce.ports.map(nomeDoPorto).join(', ')}
      </p>
    </Cartao>
  );
}

function nomeDoPorto(port: PortType): string {
  return portLabel(port);
}
