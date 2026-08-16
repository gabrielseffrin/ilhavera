/**
 * A superfície dos painéis da HUD.
 *
 * Antes desta primitiva a string `rounded-xl bg-slate-900/70 p-3 text-sm
 * text-white` estava copiada em cinco arquivos — mão, adversários, dados,
 * histórico e chat. Cinco cópias não são um problema de digitação: são cinco
 * chances de a HUD passar a ter dois tons de painel sem ninguém decidir isso.
 *
 * O cartão traz **só a superfície**. Layout continua sendo do caso de uso, que é
 * quem sabe se aquele painel cresce, rola ou alinha ao centro — daí o
 * `className` ser concatenado em vez de substituir.
 */

import type { ComponentPropsWithoutRef } from 'react';

/** Superfície, raio, densidade de texto. Nada de posição nem de tamanho. */
export const SUPERFICIE_DO_CARTAO = 'rounded-cartao bg-superficie/70 p-3 text-sm text-white';

export type CartaoProps = ComponentPropsWithoutRef<'section'>;

export function Cartao({ className, ...resto }: CartaoProps): React.JSX.Element {
  const classes =
    className === undefined ? SUPERFICIE_DO_CARTAO : `${SUPERFICIE_DO_CARTAO} ${className}`;

  return <section className={classes} {...resto} />;
}
