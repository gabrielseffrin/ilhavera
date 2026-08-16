/**
 * Os cinco recursos, desenhados.
 *
 * **Por que caminho embutido e não `<symbol>` + `<use>`.** Um sprite precisa de
 * `id` fixo no documento, e este cliente monta **três `<App/>` no mesmo
 * documento** no aceite da Fase 4 — o `<use href="#x">` do segundo resolveria
 * para o sprite do primeiro. É o mesmo motivo que fez os stores deixarem de ser
 * singletons de módulo naquela fase, e não vale reintroduzir um singleton de
 * documento por alguns nós de DOM. A repetição real aqui é baixa: cada recurso
 * aparece uma vez por painel, com a quantidade ao lado.
 *
 * **`fill="currentColor"` é a decisão que importa.** É o que deixa o mesmo ícone
 * servir a mão (fundo claro, traço escuro) e o painel de adversários (fundo
 * escuro, traço claro) sem uma segunda cópia e sem cor codificada — e é o que
 * permite ao contraste ser resolvido no consumidor, onde ele é medido.
 *
 * Os desenhos são **grossos de propósito**: aparecem a 13–16px, e nesse tamanho
 * um traço fino vira poeira cinza. Nenhum tem `<title>`: são decorativos, e o
 * significado já está no texto ao lado ou no `title` de quem os embrulha. Um
 * `<title>` aqui entraria no `textContent` e o painel de adversários passaria a
 * conter o nome do recurso — exatamente o que `paineis.test.tsx` proíbe, porque
 * é a fronteira de §4.5 dentro do navegador.
 */

import type { Resource } from '@ilhavera/rules';

/**
 * Cada recurso é um `<path>` só, para o custo por ícone ficar num nó.
 *
 * Exportado porque o tabuleiro usa o mesmo traçado: o hexágono de Floresta leva
 * a marca d'água da Madeira, ligada por `TERRAIN_PRODUCES`. Uma pessoa aprende
 * um símbolo e o reconhece nos dois lugares — e um desenho novo não pode
 * divergir entre a mão e a mesa, porque só existe um.
 */
export const CAMINHO_DO_RECURSO: Readonly<Record<Resource, string>> = {
  /** Conífera: duas copas e um tronco. */
  lumber: 'M12 2 17 10.5H7ZM12 7.5 19.5 18H4.5ZM10.4 18h3.2v4h-3.2z',
  /** Alvenaria em fiada corrida — a junta desencontrada é o que diz "tijolo". */
  brick: 'M3 5h18v5H3zM3 11.5h8v5H3zM13 11.5h8v5h-8zM3 18h18v1.5H3z',
  /** Tufo de lã com quatro patas: a silhueta de nuvem sozinha vira nuvem. */
  wool: 'M7 16.5a3.6 3.6 0 0 1 .3-7.1 4.6 4.6 0 0 1 8.3-1.7 4.1 4.1 0 0 1 1.6 8.8Zm1.6 1h2v3.2h-2zm5.2 0h2v3.2h-2z',
  /** Espiga: três grãos em losango sobre a haste. */
  grain: 'M12 2.2 15 5.6 12 9 9 5.6ZM12 7.6l3 3.4-3 3.4-3-3.4ZM11.15 12.6h1.7V22h-1.7z',
  /** Cristal bruto e facetado — montanha confundiria com o terreno. */
  ore: 'M12 2.4 20 8.2 17 20H7L4 8.2Z',
};

export type IconeDeRecursoProps = {
  recurso: Resource;
  /** Lado do quadrado, em pixels. */
  tamanho?: number;
};

export function IconeDeRecurso({ recurso, tamanho = 14 }: IconeDeRecursoProps): React.JSX.Element {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      data-icone={recurso}
      className="shrink-0"
    >
      <path d={CAMINHO_DO_RECURSO[recurso]} />
    </svg>
  );
}
