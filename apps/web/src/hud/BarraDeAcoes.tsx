/**
 * As jogadas que não têm lugar no tabuleiro: rolar, comprar carta, encerrar.
 *
 * Cada botão só aparece quando a ação correspondente está na lista de legais.
 * Botão desabilitado que ninguém sabe por que está desabilitado é pior que
 * botão ausente — e a lista de legais já sabe a resposta.
 */

import type { Action } from '@ilhavera/rules';

export type BarraDeAcoesProps = {
  legais: readonly Action[];
  onEscolher: (acao: Action) => void;
};

const ROTULOS: Partial<Record<Action['type'], string>> = {
  rollDice: 'Rolar dados',
  buyDevCard: 'Comprar Carta de Progresso',
  endTurn: 'Encerrar turno',
  playKnight: 'Jogar Soldado',
  playRoadBuilding: 'Jogar Construção de Estradas',
};

/** A ordem em que aparecem, independente da ordem do enumerador. */
const ORDEM: Action['type'][] = [
  'rollDice',
  'buyDevCard',
  'playKnight',
  'playRoadBuilding',
  'endTurn',
];

export function BarraDeAcoes({ legais, onEscolher }: BarraDeAcoesProps): React.JSX.Element | null {
  const disponiveis = ORDEM.map((tipo) => ({
    tipo,
    acao: legais.find((a) => a.type === tipo),
  })).filter((item): item is { tipo: Action['type']; acao: Action } => item.acao !== undefined);

  if (disponiveis.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" data-testid="barra-de-acoes">
      {disponiveis.map(({ tipo, acao }) => (
        <button
          key={tipo}
          type="button"
          onClick={() => {
            onEscolher(acao);
          }}
          className="rounded-lg bg-white/95 px-3 py-2 text-sm font-medium text-slate-800 shadow transition hover:bg-white"
        >
          {ROTULOS[tipo] ?? tipo}
        </button>
      ))}
    </div>
  );
}
