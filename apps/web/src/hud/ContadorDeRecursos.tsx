/**
 * Escolher quantas cartas de cada recurso.
 *
 * Nasceu dentro do modal de descarte e saiu de lá quando o compositor de troca
 * pediu a mesma coisa. São os dois lugares em que o jogador monta uma
 * combinação que o motor não enumera — o descarte porque é exponencial na mão, a
 * proposta porque é infinita —, e é o mesmo gesto nos dois.
 */

import { RESOURCES, RESOURCE_LABELS, type Resource, type ResourceCount } from '@ilhavera/rules';

import { COR_DO_RECURSO } from '../board/cores.js';

export type ContadorDeRecursosProps = {
  /** Prefixo dos `data-`, para dois contadores na mesma tela. */
  id: string;
  /**
   * Sufixo dos rótulos ARIA, quando dois contadores dividem a tela: o
   * compositor de troca tem "mais Lã em ofereco" e "mais Lã em peco", e sem a
   * distinção o leitor de tela anuncia dois botões com o mesmo nome.
   *
   * Omitido, o rótulo é só "mais Lã" — é o caso do descarte, que é um contador
   * sozinho num diálogo. Um escopo que não desambigua nada é ruído que o leitor
   * de tela lê em voz alta a cada botão.
   */
  escopo?: string;
  valor: ResourceCount;
  aoMudar: (valor: ResourceCount) => void;
  /** O teto de cada recurso. Sem ele, o céu. */
  limite?: (r: Resource) => number;
  /** Texto ao lado do nome — "tem 3", por exemplo. */
  legenda?: (r: Resource) => string | null;
  /** Trava os `+` quando a soma já chegou onde precisava. */
  cheio?: boolean;
};

export function ContadorDeRecursos({
  id,
  escopo,
  valor,
  aoMudar,
  limite,
  legenda,
  cheio = false,
}: ContadorDeRecursosProps): React.JSX.Element {
  const mexer = (r: Resource, delta: number): void => {
    const teto = limite?.(r) ?? Number.POSITIVE_INFINITY;
    aoMudar({ ...valor, [r]: Math.max(0, Math.min(teto, valor[r] + delta)) });
  };

  const rotular = (acao: string, r: Resource): string =>
    escopo === undefined
      ? `${acao} ${RESOURCE_LABELS[r]}`
      : `${acao} ${RESOURCE_LABELS[r]} em ${escopo}`;

  return (
    <ul className="flex flex-col gap-1.5" data-contador={id}>
      {RESOURCES.map((r) => {
        const nota = legenda?.(r) ?? null;
        return (
          <li key={r} data-recurso={r} className="flex items-center gap-2">
            <span
              className="w-24 rounded-lg px-2 py-1 text-xs font-medium text-slate-900"
              style={{ backgroundColor: COR_DO_RECURSO[r] }}
            >
              {RESOURCE_LABELS[r]}
            </span>
            {nota !== null && <span className="w-16 text-xs text-white/60">{nota}</span>}

            <button
              type="button"
              aria-label={rotular('menos', r)}
              disabled={valor[r] === 0}
              onClick={() => {
                mexer(r, -1);
              }}
              className="h-7 w-7 rounded-lg bg-white/10 transition hover:bg-white/20 disabled:opacity-30"
            >
              −
            </button>
            <strong data-qtd={valor[r]} className="w-6 text-center tabular-nums">
              {valor[r]}
            </strong>
            <button
              type="button"
              aria-label={rotular('mais', r)}
              disabled={cheio || valor[r] >= (limite?.(r) ?? Number.POSITIVE_INFINITY)}
              onClick={() => {
                mexer(r, 1);
              }}
              className="h-7 w-7 rounded-lg bg-white/10 transition hover:bg-white/20 disabled:opacity-30"
            >
              +
            </button>
          </li>
        );
      })}
    </ul>
  );
}
