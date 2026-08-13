/**
 * A casca da aplicação.
 *
 * Nesta fase o cliente roda o motor localmente (hot-seat) para que o tabuleiro
 * e o HUD possam ser construídos sem depender do servidor — é o item "modo
 * hot-seat local" da Fase 3. A ligação com o socket é a Fase 4; o contrato já
 * existe desde a Fase 2 e só o store muda.
 *
 * Aqui só há composição. Tudo o que a tela mostra sai de `mesa`, a projeção do
 * jogador ativo, e nenhum componente abaixo daqui conhece `GameState`.
 *
 * Sobre o layout: `min-h-0` aparece em toda a cadeia de flex de propósito. Sem
 * ele o `overflow-y-auto` do log não segura nada e a página inteira cresce até
 * empurrar o tabuleiro para fora da tela — é o tropeço clássico de flexbox
 * aninhado, e custa caro descobrir depois.
 */

import { useMemo } from 'react';
import { ERROR_LABELS, PHASE_LABELS } from '@ilhavera/rules';

import { CamadaInterativa } from './board/CamadaInterativa.js';
import { Pecas } from './board/Pecas.js';
import { Tabuleiro } from './board/Tabuleiro.js';
import { BarraDeAcoes } from './hud/BarraDeAcoes.js';
import { PainelLateral } from './hud/PainelLateral.js';
import { usePartida } from './estado/partida.js';

export function App(): React.JSX.Element {
  const mesa = usePartida((s) => s.mesa);
  const ativo = usePartida((s) => s.ativo);
  const legais = usePartida((s) => s.legais);
  const erro = usePartida((s) => s.erro);
  const executar = usePartida((s) => s.executar);
  const reiniciar = usePartida((s) => s.reiniciar);

  const cores = useMemo(
    () => Object.fromEntries(mesa.players.map((p) => [p.id, p.color])),
    [mesa.players],
  );

  const jogador = mesa.players.find((p) => p.id === ativo);

  return (
    <main className="flex h-full flex-col gap-3 p-4">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold text-white drop-shadow">Ilhavera</h1>
        <span className="text-sm text-white/80">hot-seat local</span>

        <span className="ml-auto text-sm text-white/90">
          {PHASE_LABELS[mesa.phase]} · turno {mesa.turnNumber}
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

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <section className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="min-h-0 flex-1">
            <Tabuleiro estado={mesa}>
              <Pecas
                board={mesa.board}
                buildings={mesa.buildings}
                roads={mesa.roads}
                cores={cores}
              />
              <CamadaInterativa board={mesa.board} legais={legais} onEscolher={executar} />
            </Tabuleiro>
          </div>

          {/* A barra e o alerta ficam junto do tabuleiro: o erro precisa
              aparecer onde se errou, não do outro lado da tela. */}
          <BarraDeAcoes legais={legais} onEscolher={executar} />

          {erro !== null && (
            <p role="alert" className="rounded-lg bg-red-950/80 px-3 py-2 text-sm text-red-50">
              {ERROR_LABELS[erro]}
            </p>
          )}
        </section>

        <PainelLateral mesa={mesa} ativo={ativo} />
      </div>
    </main>
  );
}
