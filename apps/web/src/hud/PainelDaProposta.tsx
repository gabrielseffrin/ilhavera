/**
 * A proposta em curso — o que está na mesa e quem já respondeu.
 *
 * Painel, e não modal, de propósito: quem propôs precisa continuar vendo o
 * tabuleiro enquanto as respostas chegam, e quem foi convidado precisa olhar a
 * própria mão antes de aceitar. Um modal tiraria dos dois exatamente a
 * informação que a decisão exige.
 *
 * Regra nenhuma aqui. Aceitar, recusar e fechar saem da lista de legais; o que
 * o componente faz é encontrá-las e desenhar um botão para cada. A contraproposta
 * é a exceção conhecida: existe no motor, nunca é enumerada, e o botão aparece
 * quando há um `tradeRespond` na lista — ou seja, quando o motor já disse que
 * responder é legal.
 */

import {
  describeResources,
  type Action,
  type ActionOf,
  type ClientView,
  type PlayerId,
} from '@ilhavera/rules';

import { COR_DO_JOGADOR } from '../board/cores.js';

export type PainelDaPropostaProps = {
  mesa: ClientView;
  legais: readonly Action[];
  aoEscolher: (acao: Action) => void;
  /** Abre o compositor com os termos invertidos. */
  aoContrapor: () => void;
};

export function PainelDaProposta({
  mesa,
  legais,
  aoEscolher,
  aoContrapor,
}: PainelDaPropostaProps): React.JSX.Element | null {
  const troca = mesa.activeTrade;
  if (troca === null) return null;

  const eu = mesa.you?.id ?? null;
  const proponente = nome(mesa, troca.proposer);

  const respostas = legais.filter((a): a is ActionOf<'tradeRespond'> => a.type === 'tradeRespond');
  const fechamentos = legais.filter(
    (a): a is ActionOf<'tradeConfirm'> => a.type === 'tradeConfirm',
  );

  const souAlvo = respostas.length > 0;
  const souProponente = eu !== null && eu === troca.proposer;

  return (
    <section
      data-testid="proposta"
      data-proponente={troca.proposer}
      className="flex flex-col gap-2 rounded-xl bg-white/10 p-3 text-sm text-white"
    >
      <h2 className="flex items-center gap-2 font-medium">
        <span
          aria-hidden
          className="size-3 rounded-full"
          style={{ background: COR_DO_JOGADOR[cor(mesa, troca.proposer)] }}
        />
        {souProponente ? 'Sua proposta' : `${proponente} propôs`}
      </h2>

      <p className="text-white/80">
        Dá <strong>{describeResources(troca.terms.give)}</strong> por{' '}
        <strong>{describeResources(troca.terms.receive)}</strong>
      </p>

      <ul className="flex flex-col gap-1" data-testid="respostas">
        {troca.targets.map((alvo) => {
          const resposta = troca.responses[alvo];
          return (
            <li key={alvo} data-alvo={alvo} data-resposta={resposta?.type ?? 'aguardando'}>
              <span className="text-white/70">{nome(mesa, alvo)}: </span>
              {resposta === undefined && <span className="text-white/50">aguardando</span>}
              {resposta?.type === 'accept' && <span className="text-emerald-300">aceitou</span>}
              {resposta?.type === 'decline' && <span className="text-red-300">recusou</span>}
              {resposta?.type === 'counter' && (
                <span className="text-amber-300">
                  contrapôs: {describeResources(resposta.terms.give)} por{' '}
                  {describeResources(resposta.terms.receive)}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {souAlvo && (
        <div className="flex flex-wrap gap-2">
          {respostas
            .filter((a) => a.response.type === 'accept' || a.response.type === 'decline')
            .map((acao) => (
              <button
                key={acao.response.type}
                type="button"
                data-resposta={acao.response.type}
                onClick={() => {
                  aoEscolher(acao);
                }}
                className="rounded-lg bg-white/95 px-3 py-1.5 font-medium text-slate-900 transition hover:bg-white"
              >
                {acao.response.type === 'accept' ? 'Aceitar' : 'Recusar'}
              </button>
            ))}
          <button
            type="button"
            data-resposta="counter"
            onClick={aoContrapor}
            className="rounded-lg bg-white/10 px-3 py-1.5 transition hover:bg-white/20"
          >
            Contrapor
          </button>
        </div>
      )}

      {fechamentos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fechamentos.map((acao) => (
            <button
              key={acao.withPlayer}
              type="button"
              data-fechar-com={acao.withPlayer}
              onClick={() => {
                aoEscolher(acao);
              }}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white transition hover:bg-emerald-500"
            >
              Fechar com {nome(mesa, acao.withPlayer)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function nome(mesa: ClientView, id: PlayerId): string {
  return mesa.players.find((p) => p.id === id)?.name ?? id;
}

function cor(mesa: ClientView, id: PlayerId): keyof typeof COR_DO_JOGADOR {
  return mesa.players.find((p) => p.id === id)?.color ?? 'white';
}
