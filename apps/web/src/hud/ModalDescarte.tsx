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
  emptyResourceCount,
  type Action,
  type ResourceCount,
  type SelfPlayerView,
} from '@ilhavera/rules';

import { Botao } from './base/Botao.js';
import { ContadorDeRecursos } from './ContadorDeRecursos.js';
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

  return (
    <Modal id="descarte" titulo={`Descarte obrigatório — ${voce.name}`}>
      <p className="text-sm text-white/70">
        Saiu 7. Escolha exatamente <strong>{total}</strong> cartas para devolver ao banco.
      </p>

      {/* Sem `escopo`: é o único contador da tela, e "mais Lã em descarte" só
          faria o leitor de tela ler um desambiguador que não desambigua nada.
          O teto por recurso é o que se tem; o teto da soma é o `cheio`. */}
      <ContadorDeRecursos
        id="descarte"
        valor={escolha}
        aoMudar={setEscolha}
        limite={(r) => voce.resources[r]}
        legenda={(r) => `tem ${voce.resources[r]}`}
        cheio={completo}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="contador-descarte" className="text-sm tabular-nums text-white/80">
          {somado} de {total}
        </span>

        {automatico !== undefined && (
          <Botao
            tom="discreto"
            onClick={() => {
              if (automatico.type === 'discard') aoConfirmar(automatico.resources);
            }}
            className="px-3 py-2 text-sm"
          >
            Descartar automático
          </Botao>
        )}

        <Botao
          tom="primario"
          disabled={!completo}
          onClick={() => {
            aoConfirmar(escolha);
          }}
          className="ml-auto px-3 py-2 text-sm font-medium shadow"
        >
          Descartar
        </Botao>
      </div>
    </Modal>
  );
}
