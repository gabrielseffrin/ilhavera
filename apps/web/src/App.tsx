/**
 * A casca da aplicação.
 *
 * Nesta fase o cliente roda o motor localmente (hot-seat) para que o tabuleiro
 * e o HUD possam ser construídos sem depender do servidor — é o item "modo
 * hot-seat local" da Fase 3. A ligação com o socket é a Fase 4; o contrato já
 * existe desde a Fase 2 e só o store muda.
 */

import { useMemo } from 'react';
import { ERROR_LABELS, PHASE_LABELS } from '@ilhavera/rules';

import { CamadaInterativa } from './board/CamadaInterativa.js';
import { Pecas } from './board/Pecas.js';
import { Tabuleiro } from './board/Tabuleiro.js';
import { BarraDeAcoes } from './hud/BarraDeAcoes.js';
import { jogadasLegais, jogadorAtivo, usePartida } from './estado/partida.js';

export function App(): React.JSX.Element {
  const jogo = usePartida((s) => s.jogo);
  const erro = usePartida((s) => s.erro);
  const executar = usePartida((s) => s.executar);
  const reiniciar = usePartida((s) => s.reiniciar);

  const legais = useMemo(() => jogadasLegais(jogo), [jogo]);
  const ativo = jogadorAtivo(jogo);

  const cores = useMemo(
    () => Object.fromEntries(jogo.players.map((p) => [p.id, p.color])),
    [jogo.players],
  );

  const jogador = jogo.players.find((p) => p.id === ativo);

  return (
    <main className="flex h-full flex-col gap-3 p-4">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold text-white drop-shadow">Ilhavera</h1>
        <span className="text-sm text-white/80">hot-seat local</span>

        <span className="ml-auto text-sm text-white/90">
          {PHASE_LABELS[jogo.phase]} · turno {jogo.turnNumber}
        </span>
        <button
          type="button"
          onClick={() => {
            reiniciar();
          }}
          className="rounded-lg bg-white/20 px-3 py-1 text-sm text-white transition hover:bg-white/30"
        >
          Nova partida
        </button>
      </header>

      {jogador !== undefined && (
        <p className="text-sm text-white" data-testid="vez-de">
          Vez de <strong>{jogador.name}</strong>
        </p>
      )}

      {erro !== null && (
        <p role="alert" className="rounded-lg bg-red-950/80 px-3 py-2 text-sm text-red-50">
          {ERROR_LABELS[erro]}
        </p>
      )}

      <BarraDeAcoes legais={legais} onEscolher={executar} />

      <div className="min-h-0 flex-1">
        <Tabuleiro estado={jogo}>
          <Pecas board={jogo.board} buildings={jogo.buildings} roads={jogo.roads} cores={cores} />
          <CamadaInterativa board={jogo.board} legais={legais} onEscolher={executar} />
        </Tabuleiro>
      </div>
    </main>
  );
}
