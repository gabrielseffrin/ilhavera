/**
 * O placar final — de onde veio cada ponto de cada jogador.
 *
 * Até a Fase 4 isto era uma faixa de uma linha, deliberadamente magra: sem
 * *algum* fim visível a mesa só para de aceitar jogadas e ninguém entende por
 * quê. O que faltava era responder a pergunta que se faz em seguida, e que só o
 * fim de partida pode responder: **por quanto, e por causa de quê**.
 *
 * A tabela vem de `mesa.finalScores`, que o motor só preenche quando há
 * vencedor. É a única informação desta tela que era oculta durante a partida —
 * as cartas de Ponto de Vitória alheias — e é por isso que este componente não
 * a calcula: quem decide que já dá para revelar é `toClientView`, uma função só,
 * testada dos dois lados. Somar cartas de PV aqui traria de volta, no
 * navegador, exatamente o vazamento que a projeção existe para impedir.
 */

import {
  DEV_CARD_LABELS,
  LARGEST_ARMY_LABEL,
  LONGEST_ROAD_LABEL,
  type ClientView,
  type VictoryBreakdown,
} from '@ilhavera/rules';

import { IconeDoJogador } from '../board/Marca.js';
import { IconeDeSimbolo } from './icones/IconeDeSimbolo.js';
import { t } from '../i18n/pt-BR.js';

export type FimDePartidaProps = {
  mesa: ClientView;
};

/** As colunas da tabela, na ordem em que a §3.4 soma os pontos. */
const COLUNAS: { chave: keyof Omit<VictoryBreakdown, 'total'>; curto: string; longo: string }[] = [
  {
    chave: 'settlements',
    curto: t.fimDePartida.assentamentos,
    longo: t.fimDePartida.assentamentosLongo,
  },
  { chave: 'cities', curto: t.fimDePartida.cidades, longo: t.fimDePartida.cidadesLongo },
  {
    chave: 'largestArmy',
    curto: t.fimDePartida.exercito,
    longo: `${LARGEST_ARMY_LABEL} (2 pontos)`,
  },
  {
    chave: 'longestRoad',
    curto: t.fimDePartida.estrada,
    longo: `${LONGEST_ROAD_LABEL} (2 pontos)`,
  },
  {
    chave: 'devCards',
    curto: t.fimDePartida.cartas,
    longo: `Cartas de ${DEV_CARD_LABELS.victoryPoint} (1 ponto cada)`,
  },
];

export function FimDePartida({ mesa }: FimDePartidaProps): React.JSX.Element | null {
  if (mesa.winner === null) return null;

  const vencedor = mesa.players.find((p) => p.id === mesa.winner);
  if (vencedor === undefined) return null;

  const placar = mesa.finalScores;
  const total = (id: string): number => placar?.[id]?.total ?? 0;

  /**
   * Do maior para o menor. A ordem dos assentos é a da mesa, e a mesa acabou —
   * quem lê um placar quer saber a classificação, não quem sentou primeiro.
   */
  const classificados = [...mesa.players].sort((a, b) => total(b.id) - total(a.id));

  return (
    <section
      data-testid="fim-de-partida"
      data-vencedor={vencedor.id}
      className="flex flex-col gap-2 rounded-xl bg-amber-300 p-3 text-amber-950"
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <IconeDoJogador cor={vencedor.color} />
        <IconeDeSimbolo simbolo="trofeu" tamanho={15} />
        {t.fimDePartida.venceuCom(vencedor.name, total(vencedor.id))}
      </p>

      {placar !== null && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs tabular-nums">
            <caption className="sr-only">{t.fimDePartida.rotuloDaTabela}</caption>
            <thead>
              <tr className="border-b border-amber-950/30">
                <th scope="col" className="py-1 pr-2 font-semibold">
                  {t.fimDePartida.jogador}
                </th>
                {COLUNAS.map((c) => (
                  <th
                    key={c.chave}
                    scope="col"
                    title={c.longo}
                    className="px-1 py-1 text-right font-medium"
                  >
                    <abbr title={c.longo} className="no-underline">
                      {c.curto}
                    </abbr>
                  </th>
                ))}
                <th scope="col" className="pl-2 py-1 text-right font-semibold">
                  {t.fimDePartida.total}
                </th>
              </tr>
            </thead>

            <tbody>
              {classificados.map((p) => {
                const linha = placar[p.id];
                return (
                  <tr
                    key={p.id}
                    data-jogador={p.id}
                    data-total={linha?.total ?? 0}
                    className={p.id === vencedor.id ? 'font-semibold' : ''}
                  >
                    <th scope="row" className="flex items-center gap-1.5 py-1 pr-2 font-[inherit]">
                      <IconeDoJogador cor={p.color} tamanho={13} />
                      {p.name}
                    </th>
                    {COLUNAS.map((c) => (
                      <td key={c.chave} className="px-1 py-1 text-right">
                        {/* Zero vira travessão: uma coluna de zeros esconde os
                            números que importam no meio do ruído. */}
                        {linha?.[c.chave] === 0 ? (
                          <span className="text-amber-950/75">—</span>
                        ) : (
                          (linha?.[c.chave] ?? 0)
                        )}
                      </td>
                    ))}
                    <td className="py-1 pl-2 text-right">{linha?.total ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
