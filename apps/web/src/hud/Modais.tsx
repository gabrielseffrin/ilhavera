/**
 * Quem decide qual modal está na tela.
 *
 * Um lugar só, e a ordem importa: **obrigatório antes de voluntário.** Se o
 * jogador abriu o comércio com o banco e alguém rolou 7, o descarte tem que
 * tomar a tela — não dá para negociar devendo carta ao banco, e o motor recusa
 * tudo o mais até a pendência sair.
 *
 * Fica separado da `App` para poder ser testado sem montar a aplicação inteira:
 * a pergunta "que modal aparece neste estado?" é a que mais tem casos.
 */

import {
  ACTION_LABELS,
  RESOURCE_LABELS,
  rateFromPorts,
  type Action,
  type ClientView,
} from '@ilhavera/rules';

import { ModalDeEscolha } from './ModalDeEscolha.js';
import { ModalDescarte } from './ModalDescarte.js';

export type ModaisProps = {
  mesa: ClientView;
  legais: readonly Action[];
  /** Grupo de jogadas que o jogador pediu para escolher. */
  modalAberto: Action['type'] | null;
  /** Hexágono já escolhido para o Saqueador, esperando a vítima. */
  hexDoSaqueador: string | null;
  aoEscolher: (acao: Action) => void;
  aoFechar: () => void;
};

export function Modais({
  mesa,
  legais,
  modalAberto,
  hexDoSaqueador,
  aoEscolher,
  aoFechar,
}: ModaisProps): React.JSX.Element | null {
  const voce = mesa.you;

  // 1. Descarte: obrigatório, sem saída, e sempre na frente de tudo.
  if (voce !== null) {
    const devendo = mesa.pendingDiscards[voce.id] ?? 0;
    if (devendo > 0) {
      return (
        <ModalDescarte
          // Sem esta chave o React reaproveita a instância quando o próximo
          // devedor entra, e a seleção do anterior aparece na tela dele.
          key={voce.id}
          voce={voce}
          total={devendo}
          automatico={legais.find((a) => a.type === 'discard')}
          aoConfirmar={(resources) => {
            aoEscolher({ type: 'discard', player: voce.id, resources });
          }}
        />
      );
    }
  }

  // 2. Vítima do roubo: o hexágono já foi escolhido no tabuleiro, e o motor já
  // disse de quem se pode roubar. Também obrigatório — desistir agora deixaria
  // o Saqueador no ar.
  if (hexDoSaqueador !== null) {
    const alvos = legais.filter((a) => a.type === 'moveRobber' && a.hexId === hexDoSaqueador);
    if (alvos.length > 0) {
      return (
        <ModalDeEscolha
          id="roubo"
          titulo="De quem roubar?"
          mesa={mesa}
          opcoes={alvos}
          aoEscolher={aoEscolher}
        />
      );
    }
  }

  // 3. O que o jogador pediu para escolher.
  if (modalAberto === null) return null;

  const opcoes = legais.filter((a) => a.type === modalAberto);
  if (opcoes.length === 0) return null;

  return (
    <ModalDeEscolha
      id={modalAberto}
      titulo={ACTION_LABELS[modalAberto]}
      mesa={mesa}
      opcoes={opcoes}
      aoEscolher={aoEscolher}
      aoFechar={aoFechar}
      rotulo={modalAberto === 'tradeBank' ? (a) => rotuloDeBanco(mesa, a) : undefined}
    />
  );
}

/**
 * A taxa não está na ação — o motor a calcula na validação. Sem mostrá-la, dois
 * botões idênticos custam 4 e 2 cartas e o jogador não tem como saber qual.
 */
function rotuloDeBanco(mesa: ClientView, acao: Action): string {
  if (acao.type !== 'tradeBank') return '';

  const taxa = rateFromPorts(mesa.you?.ports ?? [], acao.give);
  return `${taxa}× ${RESOURCE_LABELS[acao.give]} → 1× ${RESOURCE_LABELS[acao.receive]}`;
}
