/**
 * A faixa de estado da conexão.
 *
 * Escurece sem esconder: quem caiu quer continuar olhando a mesa enquanto a
 * conexão volta, e cobrir o tabuleiro tiraria a única coisa que ainda dá para
 * fazer — acompanhar. Também não bloqueia o clique de propósito; o comando sai,
 * o socket.io o segura na fila e entrega na volta, e a idempotência por
 * `requestId` cobre a entrega dupla.
 *
 * **Uma mensagem por estado, e não um binário.** Até a Fase 5 havia duas frases
 * para quatro situações, e a que sobrava — "Reconectando…" — ia parar justamente
 * em quem nunca tinha conectado. Descrever uma reconexão para uma conexão que
 * nunca existiu não é impreciso: é enganoso, porque manda esperar por algo que
 * não vai acontecer.
 */

import { usePartida } from '../estado/contexto.js';
import type { EstadoDaConexao } from '../rede/conexao.js';
import { t } from '../i18n/pt-BR.js';

const MENSAGENS: Readonly<Record<Exclude<EstadoDaConexao, 'ligado'>, string>> = {
  ligando: t.conexao.ligando,
  reconectando: t.conexao.reconectando,
  caido: t.conexao.caido,
  inacessivel: t.conexao.inacessivel,
};

export function Reconectando(): React.JSX.Element | null {
  const conexao = usePartida((s) => s.conexao);
  const modo = usePartida((s) => s.modo);

  if (modo === 'hot-seat' || conexao === 'ligado') return null;

  return (
    <div
      role="status"
      data-testid="reconectando"
      data-conexao={conexao}
      className="pointer-events-none fixed inset-x-0 top-0 flex justify-center p-3"
    >
      <p className="rounded-full bg-slate-950/80 px-4 py-1.5 text-sm text-white shadow-lg">
        {MENSAGENS[conexao]}
        {/**
         * A dica só existe em desenvolvimento, e só quando o servidor nunca
         * respondeu — que é exatamente o caso de quem subiu `make web` sem o
         * `make dev` ao lado. Em produção ela seria ruído: não há `make` nenhum
         * para rodar, e o problema é de quem hospeda.
         */}
        {conexao === 'inacessivel' && import.meta.env.DEV && (
          <span className="ml-1 text-white/70" data-testid="dica-de-dev">
            {t.conexao.dicaDeDesenvolvimento}
          </span>
        )}
      </p>
    </div>
  );
}
