/**
 * A casca da aplicação.
 *
 * Nesta fase o cliente roda o motor localmente (hot-seat) para que o tabuleiro
 * e o HUD possam ser construídos sem depender do servidor — é o item "modo
 * hot-seat local" da Fase 3. A ligação com o socket é a Fase 4, e o contrato
 * já existe desde a Fase 2.
 */

import { useMemo } from 'react';
import { createGame } from '@ilhavera/rules';

import { Tabuleiro } from './board/Tabuleiro.js';

const JOGADORES = [
  { id: 'ana', name: 'Ana', color: 'red' as const },
  { id: 'bruno', name: 'Bruno', color: 'blue' as const },
  { id: 'carla', name: 'Carla', color: 'white' as const },
];

export function App(): React.JSX.Element {
  // Uma semente fixa enquanto o hot-seat não tem tela de criação de partida:
  // recarregar a página não deveria trocar o tabuleiro no meio do trabalho.
  const estado = useMemo(
    () => createGame({ id: 'hot-seat', seed: 'ilhavera', players: JOGADORES }),
    [],
  );

  return (
    <main className="flex h-full flex-col gap-3 p-4">
      <header className="flex items-baseline gap-3">
        <h1 className="text-xl font-semibold text-white drop-shadow">Ilhavera</h1>
        <span className="text-sm text-white/80">hot-seat local</span>
      </header>

      <div className="min-h-0 flex-1">
        <Tabuleiro estado={estado} />
      </div>
    </main>
  );
}
