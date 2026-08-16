/**
 * Liga e desliga o som.
 *
 * Some quando não há WebAudio: um botão que promete som e não entrega é pior
 * que botão nenhum.
 *
 * O primeiro clique serve a duas coisas de uma vez — muda a preferência e **é o
 * gesto** que o navegador exige para deixar o áudio tocar. Por isso ele toca uma
 * nota ao ligar: confirma a escolha e desperta o contexto no mesmo movimento.
 */

import { useState } from 'react';

import { definirMudo, estaMudo, sintetizador } from '../som/som.js';
import { IconeDeSimbolo } from './icones/IconeDeSimbolo.js';
import { t } from '../i18n/pt-BR.js';

export function BotaoDeSom(): React.JSX.Element | null {
  const [mudo, setMudo] = useState(() => estaMudo());

  if (!sintetizador().disponivel) return null;

  return (
    <button
      type="button"
      data-testid="alternar-som"
      aria-pressed={!mudo}
      aria-label={mudo ? t.som.ligar : t.som.desligar}
      onClick={() => {
        const agoraMudo = !mudo;
        definirMudo(agoraMudo);
        setMudo(agoraMudo);
        if (!agoraMudo) sintetizador().tocar('suaVez');
      }}
      className="rounded-lg bg-white/20 px-2 py-1 text-sm text-white transition hover:bg-white/30"
    >
      {/* O rótulo vive no `aria-label`, que já diz "ligar"/"desligar o som" —
          o desenho é decorativo e não repete a informação em voz alta. */}
      <IconeDeSimbolo simbolo={mudo ? 'mudo' : 'som'} tamanho={16} />
    </button>
  );
}
