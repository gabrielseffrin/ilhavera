/**
 * O que aconteceu na partida, em português.
 *
 * O texto vem de `describeEvent`, do próprio motor — a mesma frase que a CLI
 * imprime desde a Fase 1. Reescrever a narração aqui daria duas versões da
 * mesma verdade, e a que diverge calada é a de texto: nenhum teste reclama de
 * uma frase desatualizada.
 *
 * Três cuidados que o log obriga:
 *
 * - o array **não é invertido em memória.** `reverse()` mutaria o log dentro do
 *   estado projetado, e na Fase 4 isso seria mutar o snapshot do servidor. A
 *   ordem de leitura é resolvida no CSS;
 * - a chave é o índice, porque evento do motor não tem id nem timestamp. Pode:
 *   o log é append-only no motor e continua sendo no `state:patch`;
 * - cinco das variantes não têm ator — `'actor' in evento` é o teste correto.
 *   Ler `evento.actor` direto é como se produz uma bolinha sem cor na tela.
 */

import { useEffect, useRef } from 'react';

import { describeEvent, type ClientView, type GameEvent } from '@ilhavera/rules';

import { COR_DO_JOGADOR } from '../board/cores.js';
import { Cartao } from './base/Cartao.js';
import { t } from '../i18n/pt-BR.js';

export type LogDeEventosProps = {
  mesa: ClientView;
  /** Quantos eventos mostrar, do mais recente para trás. */
  limite?: number;
};

export function LogDeEventos({ mesa, limite = 60 }: LogDeEventosProps): React.JSX.Element {
  const fim = useRef<HTMLLIElement>(null);
  const total = mesa.log.length;

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'nearest' });
  }, [total]);

  const inicio = Math.max(0, total - limite);
  const recentes = mesa.log.slice(inicio);

  return (
    <Cartao data-testid="log" className="flex min-h-0 flex-1 flex-col">
      <h2 className="mb-2 font-semibold">{t.historico.titulo}</h2>

      <ol
        role="log"
        aria-live="polite"
        aria-label={t.historico.rotulo}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 text-xs"
      >
        {recentes.map((evento, i) => (
          <li
            key={inicio + i}
            ref={i === recentes.length - 1 ? fim : null}
            data-evento={evento.type}
            className="flex items-start gap-1.5 text-white/85"
          >
            <Bolinha mesa={mesa} evento={evento} />
            <span>{describeEvent(mesa, evento)}</span>
          </li>
        ))}
      </ol>
    </Cartao>
  );
}

/**
 * A cor de quem agiu, quando houve alguém. Os cinco eventos de mesa —
 * início de partida, produção, descarte obrigatório e troca de bônus — saem sem
 * bolinha, porque não são de ninguém.
 */
function Bolinha({
  mesa,
  evento,
}: {
  mesa: ClientView;
  evento: GameEvent;
}): React.JSX.Element | null {
  if (!('actor' in evento)) return null;

  const jogador = mesa.players.find((p) => p.id === evento.actor);
  if (jogador === undefined) return null;

  return (
    <span
      aria-hidden
      data-ator={jogador.id}
      className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: COR_DO_JOGADOR[jogador.color] }}
    />
  );
}
