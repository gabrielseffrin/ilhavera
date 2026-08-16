/**
 * A casca de todo modal.
 *
 * A ausência de `aoFechar` é o que marca um modal **obrigatório**: sem botão de
 * fechar, sem Escape, sem clique no fundo. Descarte e escolha de vítima do
 * roubo não são convites — a partida não anda enquanto não forem resolvidos, e
 * um modal que se fecha sozinho deixaria o jogador olhando para uma tela sem
 * nenhuma jogada disponível, sem entender o que travou.
 *
 * ## O foco, e por que o Escape desceu para cá
 *
 * Até a Fase 4 o ouvinte de Escape morava em `window`. Funcionava numa tela só e
 * era errado em duas: com três `<App/>` no mesmo documento — o aceite da Fase 4 —
 * um Escape fechava o modal de todas elas. A dívida estava anotada, e a correção
 * é a mesma coisa que a acessibilidade pedia de qualquer jeito: o ouvinte
 * pertence ao diálogo, não à janela.
 *
 * Com ele desceu o resto do que um diálogo deve: o foco entra ao abrir e volta
 * para onde estava ao fechar, e o Tab circula dentro em vez de passear pelo
 * tabuleiro atrás do fundo escuro. Sem isso, quem navega por teclado abre o
 * modal de descarte e continua tabulando pelos vértices que não pode clicar.
 */

import { useEffect, useRef } from 'react';
import { t } from '../i18n/pt-BR.js';

export type ModalProps = {
  titulo: string;
  /** Identifica o modal nos testes e no DOM. */
  id: string;
  children: React.ReactNode;
  /** Quando existe, o modal é dispensável. Quando não, é obrigatório. */
  aoFechar?: (() => void) | undefined;
};

/** O que o Tab alcança. `[tabindex="-1"]` fica de fora de propósito. */
const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ titulo, id, children, aoFechar }: ModalProps): React.JSX.Element {
  const caixa = useRef<HTMLDivElement>(null);

  /**
   * O foco entra ao abrir e volta ao sair.
   *
   * Sem dependências de propósito: roda uma vez por montagem, que é o ciclo de
   * vida de um modal. `aoFechar` mudando de identidade a cada render não pode
   * roubar o foco de quem já está digitando dentro.
   */
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const primeiro = caixa.current?.querySelector<HTMLElement>(FOCAVEIS);
    // O diálogo em si quando não há controle nenhum — o anúncio precisa de um
    // lugar para acontecer, e um modal sem foco não é lido.
    (primeiro ?? caixa.current)?.focus();

    return () => {
      anterior?.focus();
    };
  }, []);

  return (
    <div
      data-testid="modal"
      data-modal={id}
      className="fixed inset-0 z-10 flex items-center justify-center bg-slate-950/60 p-4"
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        /**
         * No próprio diálogo, e não em `window`: o evento sobe até aqui vindo de
         * qualquer coisa focada dentro, e não alcança os modais das outras
         * árvores montadas no mesmo documento.
         */
        onKeyDown={(e) => {
          if (e.key === 'Escape' && aoFechar !== undefined) {
            e.stopPropagation();
            aoFechar();
            return;
          }
          if (e.key === 'Tab') prenderOTab(e, caixa.current);
        }}
        className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-2xl bg-slate-900 p-4 text-white shadow-2xl focus:outline-none"
      >
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          {aoFechar !== undefined && (
            <button
              type="button"
              onClick={aoFechar}
              className="ml-auto rounded-lg bg-white/10 px-2 py-1 text-sm transition hover:bg-white/20"
            >
              {t.modal.cancelar}
            </button>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}

/**
 * Faz o Tab circular dentro do diálogo.
 *
 * Um modal cujo Tab escapa para o tabuleiro atrás não é modal para quem navega
 * por teclado: o fundo escuro diz "só isto aqui importa agora" e o foco diz
 * outra coisa.
 */
function prenderOTab(e: React.KeyboardEvent, caixa: HTMLElement | null): void {
  if (caixa === null) return;

  const focaveis = [...caixa.querySelectorAll<HTMLElement>(FOCAVEIS)];
  const primeiro = focaveis[0];
  const ultimo = focaveis[focaveis.length - 1];
  if (primeiro === undefined || ultimo === undefined) return;

  const atual = document.activeElement;
  if (e.shiftKey && (atual === primeiro || atual === caixa)) {
    e.preventDefault();
    ultimo.focus();
  } else if (!e.shiftKey && atual === ultimo) {
    e.preventDefault();
    primeiro.focus();
  }
}
