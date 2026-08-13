/**
 * Escolher entre várias jogadas do mesmo tipo.
 *
 * Serve Monopólio, Descoberta, comércio com o banco e a vítima do roubo com o
 * mesmo componente, porque nos quatro casos o motor **já enumerou as opções**:
 * os cinco recursos do Monopólio, os quinze pares da Descoberta (duplos
 * inclusive), os pares de troca que o jogador banca e o banco tem, e as vítimas
 * que sobraram depois de `stealCandidates`.
 *
 * Por isso este arquivo não sabe uma regra sequer. Ele não itera `RESOURCES`
 * para montar os botões do Monopólio, não calcula quem tem carta para roubar,
 * não confere saldo. Se soubesse, seria uma segunda opinião sobre as regras —
 * e é impossível ele oferecer uma jogada que o motor recusaria, porque só
 * mostra o que veio da lista.
 */

import { describeAction, type Action, type ClientView } from '@ilhavera/rules';

import { Modal } from './Modal.js';

export type ModalDeEscolhaProps = {
  id: string;
  titulo: string;
  mesa: ClientView;
  opcoes: readonly Action[];
  aoEscolher: (acao: Action) => void;
  /** Ausente = modal obrigatório, sem saída. */
  aoFechar?: (() => void) | undefined;
  /** Rótulo alternativo, quando `describeAction` não conta a história toda. */
  rotulo?: ((acao: Action) => string) | undefined;
};

export function ModalDeEscolha({
  id,
  titulo,
  mesa,
  opcoes,
  aoEscolher,
  aoFechar,
  rotulo,
}: ModalDeEscolhaProps): React.JSX.Element {
  return (
    <Modal id={id} titulo={titulo} aoFechar={aoFechar}>
      <ul className="flex flex-col gap-1.5">
        {opcoes.map((acao, i) => (
          <li key={i}>
            <button
              type="button"
              data-opcao={i}
              onClick={() => {
                aoEscolher(acao);
              }}
              className="w-full rounded-lg bg-white/90 px-3 py-2 text-left text-sm text-slate-900 transition hover:bg-white"
            >
              {rotulo?.(acao) ?? describeAction(mesa, acao)}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
