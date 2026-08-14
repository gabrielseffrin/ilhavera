/**
 * A faixa de "reconectando".
 *
 * Escurece sem esconder: quem caiu quer continuar olhando a mesa enquanto a
 * conexão volta, e cobrir o tabuleiro tiraria a única coisa que ainda dá para
 * fazer — acompanhar. Também não bloqueia o clique de propósito; o comando sai,
 * o socket.io o segura na fila e entrega na volta, e a idempotência por
 * `requestId` cobre a entrega dupla.
 */

import { usePartida } from '../estado/contexto.js';

export function Reconectando(): React.JSX.Element | null {
  const conexao = usePartida((s) => s.conexao);
  const modo = usePartida((s) => s.modo);

  if (modo === 'hot-seat' || conexao === 'ligado') return null;

  return (
    <div
      role="status"
      data-testid="reconectando"
      className="pointer-events-none fixed inset-x-0 top-0 flex justify-center p-3"
    >
      <p className="rounded-full bg-slate-950/80 px-4 py-1.5 text-sm text-white shadow-lg">
        {conexao === 'caido' ? 'Sem conexão com o servidor.' : 'Reconectando…'}
      </p>
    </div>
  );
}
