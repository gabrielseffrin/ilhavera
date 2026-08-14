/**
 * As jogadas que não têm lugar no tabuleiro: rolar, comprar, comerciar, jogar
 * carta, encerrar.
 *
 * Uma regra só decide o comportamento de todos os botões: **grupo com uma opção
 * dispara direto, grupo com várias abre uma escolha.** Isso resolve rolar
 * (1 jogada), Monopólio (5), Descoberta (15 pares) e comércio com o banco (20
 * pares) sem uma lista de exceções, e é o mesmo desenho de dois níveis que a
 * CLI já provou ao longo de umas quinhentas jogadas por partida de teste.
 *
 * Botão que não aparece em vez de botão desabilitado: só se mostra o que está
 * na lista de legais. Botão cinza que ninguém sabe por que está cinza é pior
 * que botão ausente, e a lista já sabe a resposta.
 *
 * Descarte e Saqueador ficam de fora: um é modal obrigatório, o outro se
 * escolhe no tabuleiro. Nem um nem outro é uma opção a se considerar.
 */

import { ACTION_LABELS, groupActions, type Action, type ActionType } from '@ilhavera/rules';

export type BarraDeAcoesProps = {
  legais: readonly Action[];
  /** Grupo de uma opção só. */
  onEscolher: (acao: Action) => void;
  /** Grupo com várias — quem monta decide qual modal abrir. */
  onAbrir: (tipo: ActionType) => void;
};

/** Não têm botão aqui: pertencem ao tabuleiro ou a um modal obrigatório. */
const FORA_DA_BARRA: ActionType[] = [
  'placeSettlement',
  'placeRoad',
  'buildCity',
  'discard',
  'moveRobber',
];

/**
 * A exceção à regra dos dois níveis: sempre abre, mesmo com uma opção só.
 *
 * `tradeOffer` chega na lista como **sonda** — o servidor manda uma proposta
 * qualquer que o motor aceitaria, só para dizer que dá para propor. Disparar
 * essa uma seria mandar para a mesa uma troca que o jogador não escolheu.
 */
const SEMPRE_ABREM: ActionType[] = ['tradeOffer'];

export function BarraDeAcoes({
  legais,
  onEscolher,
  onAbrir,
}: BarraDeAcoesProps): React.JSX.Element | null {
  const grupos = groupActions(legais).filter((g) => !FORA_DA_BARRA.includes(g.type));

  if (grupos.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" data-testid="barra-de-acoes">
      {grupos.map(({ type, actions }) => {
        const unica = actions.length === 1 && !SEMPRE_ABREM.includes(type) ? actions[0] : undefined;

        return (
          <button
            key={type}
            type="button"
            data-acao={type}
            data-opcoes={actions.length}
            onClick={() => {
              if (unica !== undefined) onEscolher(unica);
              else onAbrir(type);
            }}
            className="rounded-lg bg-white/95 px-3 py-2 text-sm font-medium text-slate-800 shadow transition hover:bg-white"
          >
            {ACTION_LABELS[type]}
            {unica === undefined && !SEMPRE_ABREM.includes(type) && (
              <span className="ml-1 text-xs text-slate-500">({actions.length})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
