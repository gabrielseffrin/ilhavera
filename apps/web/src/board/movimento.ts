/**
 * `prefers-reduced-motion`, para o que o CSS não alcança.
 *
 * A regra global em `index.css` já encurta transições e `@keyframes`. O que ela
 * **não** alcança é o `<animate>` do SVG: SMIL não é CSS, e nenhuma media query
 * o desliga. O pulso dos alvos legais é justamente um `<animate>`, e é a
 * animação mais insistente da tela — repete indefinidamente, em dezenas de
 * pontos ao mesmo tempo.
 *
 * Quem pede menos movimento normalmente tem um motivo de saúde para isso, e
 * "quase tudo respeita a preferência" não serve.
 */

import { useEffect, useState } from 'react';

export const CONSULTA_DE_MOVIMENTO = '(prefers-reduced-motion: reduce)';

export function usePrefereMenosMovimento(): boolean {
  const [prefere, setPrefere] = useState(() => consultar()?.matches ?? false);

  useEffect(() => {
    const mq = consultar();
    if (mq === null) return;

    const aoMudar = (e: MediaQueryListEvent): void => {
      setPrefere(e.matches);
    };
    mq.addEventListener('change', aoMudar);
    return () => {
      mq.removeEventListener('change', aoMudar);
    };
  }, []);

  return prefere;
}

/**
 * `null` quando não há `matchMedia` — jsdom não o implementa por padrão. Sem
 * isto, montar qualquer componente do tabuleiro num teste explodiria.
 */
function consultar(): MediaQueryList | null {
  const mm = globalThis.matchMedia as typeof globalThis.matchMedia | undefined;
  return typeof mm === 'function' ? mm.call(globalThis, CONSULTA_DE_MOVIMENTO) : null;
}
