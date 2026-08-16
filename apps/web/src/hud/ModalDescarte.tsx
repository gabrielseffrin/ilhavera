/**
 * O descarte do 7 — o único modal montado à mão.
 *
 * Todos os outros saem prontos da lista de jogadas legais, mas este não pode:
 * os descartes possíveis são exponenciais na mão, e o próprio motor diz isso em
 * `legal.ts` ao gerar só duas heurísticas — "a UI de verdade deixa o jogador
 * montar o descarte à mão". É o que este componente faz, e o botão de descarte
 * automático reaproveita justamente a primeira heurística do enumerador, em vez
 * de reimplementá-la.
 *
 * Armadilha que este modal tem obrigação de evitar: no descarte **todos os
 * devedores agem em paralelo**, e o dono do modal muda quando o anterior
 * resolve a pendência. Sem `key` por jogador, o React reaproveita a instância e
 * a seleção do jogador anterior aparece na tela do próximo — inválida para a
 * mão dele e, pior, contando o que ele não deveria saber. Quem monta este
 * componente passa `key={voce.id}`.
 */

import { useState } from 'react';

import {
  RESOURCES,
  RESOURCE_LABELS,
  emptyResourceCount,
  type Action,
  type Resource,
  type ResourceCount,
  type SelfPlayerView,
} from '@ilhavera/rules';

import { COR_DO_RECURSO } from '../board/cores.js';
import { Modal } from './Modal.js';

export type ModalDescarteProps = {
  voce: SelfPlayerView;
  /** Quantas cartas o motor exige. Sai de `pendingDiscards`, nunca de estado local. */
  total: number;
  /** A heurística que o enumerador já ofereceu, se houver. */
  automatico: Action | undefined;
  aoConfirmar: (resources: ResourceCount) => void;
};

export function ModalDescarte({
  voce,
  total,
  automatico,
  aoConfirmar,
}: ModalDescarteProps): React.JSX.Element {
  const [escolha, setEscolha] = useState<ResourceCount>(emptyResourceCount());

  const somado = RESOURCES.reduce((soma, r) => soma + escolha[r], 0);
  const completo = somado === total;

  const mexer = (r: Resource, delta: number): void => {
    setEscolha((atual) => {
      const proximo = { ...atual };
      // Nem abaixo de zero, nem além do que se tem, nem além do que se deve.
      const limite = Math.min(voce.resources[r], atual[r] + (total - somado));
      proximo[r] = Math.max(0, Math.min(limite, atual[r] + delta));
      return proximo;
    });
  };

  return (
    <Modal id="descarte" titulo={`Descarte obrigatório — ${voce.name}`}>
      <p className="text-sm text-white/70">
        Saiu 7. Escolha exatamente <strong>{total}</strong> cartas para devolver ao banco.
      </p>

      <ul className="flex flex-col gap-1.5">
        {RESOURCES.map((r) => (
          <li key={r} data-descarte={r} className="flex items-center gap-2">
            <span
              className="w-24 rounded-lg px-2 py-1 text-xs font-medium text-slate-900"
              style={{ backgroundColor: COR_DO_RECURSO[r] }}
            >
              {RESOURCE_LABELS[r]}
            </span>
            <span className="w-16 text-xs text-white/60">tem {voce.resources[r]}</span>

            <button
              type="button"
              aria-label={`menos ${RESOURCE_LABELS[r]}`}
              disabled={escolha[r] === 0}
              onClick={() => {
                mexer(r, -1);
              }}
              className="h-7 w-7 rounded-lg bg-white/10 transition hover:bg-white/20 disabled:opacity-30"
            >
              −
            </button>
            <strong data-qtd={escolha[r]} className="w-6 text-center tabular-nums">
              {escolha[r]}
            </strong>
            <button
              type="button"
              aria-label={`mais ${RESOURCE_LABELS[r]}`}
              disabled={escolha[r] >= voce.resources[r] || completo}
              onClick={() => {
                mexer(r, 1);
              }}
              className="h-7 w-7 rounded-lg bg-white/10 transition hover:bg-white/20 disabled:opacity-30"
            >
              +
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="contador-descarte" className="text-sm tabular-nums text-white/80">
          {somado} de {total}
        </span>

        {automatico !== undefined && (
          <button
            type="button"
            onClick={() => {
              if (automatico.type === 'discard') aoConfirmar(automatico.resources);
            }}
            className="rounded-lg bg-white/10 px-3 py-2 text-sm transition hover:bg-white/20"
          >
            Descartar automático
          </button>
        )}

        <button
          type="button"
          disabled={!completo}
          onClick={() => {
            aoConfirmar(escolha);
          }}
          className="ml-auto rounded-lg bg-white/95 px-3 py-2 text-sm font-medium text-slate-900 shadow transition hover:bg-white disabled:opacity-40"
        >
          Descartar
        </button>
      </div>
    </Modal>
  );
}
