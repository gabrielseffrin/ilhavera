/**
 * Compor uma proposta de troca: o que ofereço, o que peço, para quem.
 *
 * O segundo modal montado à mão, e pelo mesmo motivo do descarte: as propostas
 * possíveis são infinitas, e o motor não as enumera. O que ele enumera é **uma**
 * — a sonda que o servidor manda na lista de legais só para dizer que o caminho
 * está aberto. O botão existe por causa dela; os termos são deste componente, e
 * o servidor valida na hora de aplicar.
 *
 * Serve também de contraproposta, com os papéis trocados: quem responde monta
 * outros termos e devolve. A contraproposta existe no motor desde a Fase 1 e
 * nunca foi enumerada — é a mesma composição, com outro nome.
 */

import { useState } from 'react';

import {
  emptyResourceCount,
  RESOURCES,
  type PlayerId,
  type ResourceCount,
  type SelfPlayerView,
  type TradeTerms,
} from '@ilhavera/rules';

import { COR_DO_JOGADOR } from '../board/cores.js';
import { ContadorDeRecursos } from './ContadorDeRecursos.js';
import { Modal } from './Modal.js';
import { t } from '../i18n/pt-BR.js';

export type Alvo = { id: PlayerId; name: string; color: keyof typeof COR_DO_JOGADOR };

export type ModalDePropostaProps = {
  voce: SelfPlayerView;
  /** Com quem dá para negociar. Vazio quando é contraproposta: já se sabe. */
  alvos: readonly Alvo[];
  titulo?: string;
  rotuloDoBotao?: string;
  /** Termos iniciais — a contraproposta abre com a proposta recebida invertida. */
  inicial?: TradeTerms;
  aoConfirmar: (termos: TradeTerms, alvos: PlayerId[]) => void;
  aoFechar: () => void;
};

export function ModalDeProposta({
  voce,
  alvos,
  titulo = 'Propor troca',
  rotuloDoBotao = 'Enviar proposta',
  inicial,
  aoConfirmar,
  aoFechar,
}: ModalDePropostaProps): React.JSX.Element {
  const [ofereco, setOfereco] = useState<ResourceCount>(inicial?.give ?? emptyResourceCount());
  const [peco, setPeco] = useState<ResourceCount>(inicial?.receive ?? emptyResourceCount());
  const [escolhidos, setEscolhidos] = useState<PlayerId[]>(alvos.map((a) => a.id));

  const totalOferecido = soma(ofereco);
  const totalPedido = soma(peco);

  /**
   * A trava é de forma, não de regra: proposta vazia dos dois lados não quer
   * dizer nada, e sem alvo não há a quem mandar. Se dá para pagar, quem decide é
   * o motor — o teto de cada `+` já é a mão, então o caso não chega aqui.
   *
   * Na contraproposta não há alvo a escolher: o destinatário é quem propôs, e a
   * lista vem vazia justamente por isso.
   */
  const temAQuemMandar = alvos.length === 0 || escolhidos.length > 0;
  const podeEnviar = totalOferecido > 0 && totalPedido > 0 && temAQuemMandar;

  return (
    <Modal id="proposta" titulo={titulo} aoFechar={aoFechar}>
      <div className="flex flex-col gap-4 sm:flex-row">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-white/80">{t.troca.voceOferece}</h3>
          <ContadorDeRecursos
            id="ofereco"
            valor={ofereco}
            aoMudar={setOfereco}
            limite={(r) => voce.resources[r]}
            legenda={(r) => `tem ${voce.resources[r]}`}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-white/80">{t.troca.vocePede}</h3>
          <ContadorDeRecursos id="peco" valor={peco} aoMudar={setPeco} />
        </section>
      </div>

      {alvos.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-white/80">{t.troca.paraQuem}</legend>
          <div className="flex flex-wrap gap-2">
            {alvos.map((alvo) => {
              const marcado = escolhidos.includes(alvo.id);
              return (
                <button
                  key={alvo.id}
                  type="button"
                  aria-pressed={marcado}
                  data-alvo={alvo.id}
                  onClick={() => {
                    setEscolhidos((atual) =>
                      atual.includes(alvo.id)
                        ? atual.filter((id) => id !== alvo.id)
                        : [...atual, alvo.id],
                    );
                  }}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    marcado ? 'bg-white/95 text-slate-900' : 'bg-white/10 text-white'
                  }`}
                >
                  <span
                    aria-hidden
                    className="size-3 rounded-full"
                    style={{ background: COR_DO_JOGADOR[alvo.color] }}
                  />
                  {alvo.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex items-center gap-2">
        <span className="text-sm text-white/70 tabular-nums">
          {totalOferecido} por {totalPedido}
        </span>
        <button
          type="button"
          disabled={!podeEnviar}
          onClick={() => {
            aoConfirmar({ give: ofereco, receive: peco }, escolhidos);
          }}
          className="ml-auto rounded-lg bg-white/95 px-3 py-2 text-sm font-medium text-slate-900 shadow transition hover:bg-white disabled:opacity-40"
        >
          {rotuloDoBotao}
        </button>
      </div>
    </Modal>
  );
}

function soma(contagem: ResourceCount): number {
  return RESOURCES.reduce((total, r) => total + contagem[r], 0);
}
