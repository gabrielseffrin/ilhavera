/**
 * A casca de todo modal.
 *
 * A ausência de `aoFechar` é o que marca um modal **obrigatório**: sem botão de
 * fechar, sem Escape, sem clique no fundo. Descarte e escolha de vítima do
 * roubo não são convites — a partida não anda enquanto não forem resolvidos, e
 * um modal que se fecha sozinho deixaria o jogador olhando para uma tela sem
 * nenhuma jogada disponível, sem entender o que travou.
 */

import { useEffect } from 'react';

export type ModalProps = {
  titulo: string;
  /** Identifica o modal nos testes e no DOM. */
  id: string;
  children: React.ReactNode;
  /** Quando existe, o modal é dispensável. Quando não, é obrigatório. */
  aoFechar?: (() => void) | undefined;
};

export function Modal({ titulo, id, children, aoFechar }: ModalProps): React.JSX.Element {
  useEffect(() => {
    if (aoFechar === undefined) return;

    const naTecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', naTecla);
    return () => {
      window.removeEventListener('keydown', naTecla);
    };
  }, [aoFechar]);

  return (
    <div
      data-testid="modal"
      data-modal={id}
      className="fixed inset-0 z-10 flex items-center justify-center bg-slate-950/60 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-2xl bg-slate-900 p-4 text-white shadow-2xl"
      >
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          {aoFechar !== undefined && (
            <button
              type="button"
              onClick={aoFechar}
              className="ml-auto rounded-lg bg-white/10 px-2 py-1 text-sm transition hover:bg-white/20"
            >
              Cancelar
            </button>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}
