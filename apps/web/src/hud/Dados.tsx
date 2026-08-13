/**
 * Os dois dados da rolagem.
 *
 * Duas decisões que parecem detalhe e não são:
 *
 * - `lastRoll` volta a `null` a cada `endTurn`, então o painel precisa de um
 *   estado vazio de verdade. Sumir com o componente faria a coluna inteira
 *   pular de altura toda vez que alguém encerra o turno;
 * - a animação é disparada por `chave`, não por comparar o total. Rolar 8 duas
 *   vezes seguidas não muda nada que o React consiga ver, e o dado ficaria
 *   parado justamente quando o jogador quer confirmação de que rolou.
 */

import { useEffect, useState } from 'react';

import type { ClientView } from '@ilhavera/rules';

export type DadosProps = {
  roll: ClientView['lastRoll'];
  /** Muda a cada rolagem nova — quantas já houve na partida. */
  chave: number;
};

export function Dados({ roll, chave }: DadosProps): React.JSX.Element {
  const [animando, setAnimando] = useState(false);

  useEffect(() => {
    if (chave === 0) return;
    setAnimando(true);
    const t = setTimeout(() => {
      setAnimando(false);
    }, 400);
    return () => {
      clearTimeout(t);
    };
  }, [chave]);

  return (
    <section
      data-testid="dados"
      data-total={roll?.total ?? ''}
      className="flex items-center gap-2 rounded-xl bg-slate-900/70 p-3 text-sm text-white"
    >
      <h2 className="font-semibold">Dados</h2>

      {roll === null ? (
        <span className="text-white/50">— ainda não rolou neste turno</span>
      ) : (
        <span className={`flex items-center gap-2 ${animando ? 'animate-pulse' : ''}`}>
          <Face valor={roll.dice[0]} />
          <Face valor={roll.dice[1]} />
          <strong className="tabular-nums text-lg">{roll.total}</strong>
        </span>
      )}
    </section>
  );
}

/** Posição dos pontos em cada face, numa grade 3×3 de 0 a 2. */
const PONTOS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
};

/** Pontos e não algarismo: um dado se lê antes de se contar. */
function Face({ valor }: { valor: number }): React.JSX.Element {
  const pontos = PONTOS[valor] ?? [];

  return (
    <svg viewBox="0 0 30 30" className="h-8 w-8" role="img" aria-label={`dado ${valor}`}>
      <rect
        x={1}
        y={1}
        width={28}
        height={28}
        rx={5}
        fill="oklch(0.95 0.02 85)"
        stroke="oklch(0.35 0.03 250)"
        strokeWidth={1.5}
      />
      {pontos.map(([linha, coluna], i) => (
        <circle
          key={i}
          cx={7.5 + coluna * 7.5}
          cy={7.5 + linha * 7.5}
          r={2.6}
          fill="oklch(0.25 0.01 260)"
        />
      ))}
    </svg>
  );
}
