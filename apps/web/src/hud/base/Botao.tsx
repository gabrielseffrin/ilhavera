/**
 * O botão da casca.
 *
 * O levantamento da 5.5 achou quatro famílias de cor repetidas por doze lugares,
 * e densidades que variam de propósito — `px-3 py-2` numa tela, `px-3 py-1.5`
 * num painel apertado, `px-2 py-1` no cabeçalho de um diálogo. Por isso a
 * primitiva carrega **só o tom**: é a cor que precisa de uma decisão única, e é
 * a cor que ninguém consegue conferir de memória entre doze arquivos. Espaço
 * continua sendo do caso de uso, que é quem sabe quanto ar tem ali.
 *
 * `type="button"` vem por padrão porque o padrão do HTML é `submit`, e um botão
 * dentro de `<form>` que envia sem querer é o defeito clássico — o campo do chat
 * é o único que quer `submit`, e ele diz isso explicitamente.
 */

import type { ComponentPropsWithoutRef } from 'react';

export type TomDoBotao =
  /** A ação que a tela existe para oferecer: criar sala, iniciar, fechar troca. */
  | 'afirmativo'
  /** A confirmação dentro de um diálogo. */
  | 'primario'
  /** Alternativa legítima, ao lado da principal. */
  | 'secundario'
  /** Escapatória: cancelar, recolher, recusar. */
  | 'discreto';

const TOM: Record<TomDoBotao, string> = {
  afirmativo: 'bg-acao text-white hover:bg-acao-forte',
  primario: 'bg-superficie-forte/95 text-slate-900 hover:bg-superficie-forte',
  secundario: 'bg-white/20 text-white hover:bg-white/30',
  discreto: 'bg-white/10 hover:bg-white/20',
};

const BASE = 'rounded-controle transition disabled:opacity-40';

export type BotaoProps = { tom: TomDoBotao } & ComponentPropsWithoutRef<'button'>;

export function Botao({ tom, className, ...resto }: BotaoProps): React.JSX.Element {
  const classes = `${BASE} ${TOM[tom]}${className === undefined ? '' : ` ${className}`}`;

  return <button type="button" className={classes} {...resto} />;
}
