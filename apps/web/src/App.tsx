/**
 * A casca da aplicação.
 *
 * Nesta fase o cliente roda o motor localmente (hot-seat) para que o tabuleiro
 * e o HUD possam ser construídos sem depender do servidor — é o item "modo
 * hot-seat local" da Fase 3. A ligação com o socket é a Fase 4, e o contrato
 * já existe desde a Fase 2.
 */

export function App(): React.JSX.Element {
  return (
    <main className="flex h-full items-center justify-center p-6">
      <div className="rounded-xl bg-white/90 px-8 py-6 text-center shadow-lg">
        <h1 className="text-2xl font-semibold text-slate-800">Ilhavera</h1>
        <p className="mt-2 text-slate-600">O tabuleiro entra aqui.</p>
      </div>
    </main>
  );
}
