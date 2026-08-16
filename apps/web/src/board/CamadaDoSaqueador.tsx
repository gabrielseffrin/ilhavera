/**
 * Para onde o Saqueador pode ir.
 *
 * O destino é uma posição no tabuleiro, então se escolhe no tabuleiro. Resolver
 * isso numa lista de dezoito linhas de texto seria trocar o mapa por um menu — e
 * o jogador escolhe para onde mover o Saqueador olhando de quem é o hexágono
 * vizinho, coisa que só o desenho conta.
 *
 * A `CamadaInterativa` continua sem saber que `moveRobber` existe: ela conhece
 * vértice e aresta, e isso não muda. Aqui é só hexágono.
 *
 * Os hexágonos legais vêm da lista de jogadas — o `robberHex` atual não aparece
 * porque o motor não o enumera (mover para o mesmo lugar é `ROBBER_SAME_HEX`),
 * e não porque alguém filtrou.
 */

import { ROBBER_LABEL, type ActionOf, type BoardGraph } from '@ilhavera/rules';

import { nomeDoHexagono } from './descricoes.js';
import { cantosDoHexagono, pontosDoPoligono } from './geometria.js';
import { t } from '../i18n/pt-BR.js';

export type CamadaDoSaqueadorProps = {
  board: BoardGraph;
  /** As jogadas `moveRobber` legais de quem está agindo. */
  opcoes: readonly ActionOf<'moveRobber'>[];
  aoEscolherHex: (hexId: string) => void;
};

export function CamadaDoSaqueador({
  board,
  opcoes,
  aoEscolherHex,
}: CamadaDoSaqueadorProps): React.JSX.Element | null {
  if (opcoes.length === 0) return null;

  // Várias opções caem no mesmo hexágono — uma por vítima possível. O tabuleiro
  // mostra o destino; de quem roubar é a pergunta seguinte.
  const hexes = [...new Set(opcoes.map((a) => a.hexId))];

  return (
    <g data-camada="saqueador-legal">
      {hexes.map((hexId) => {
        const hex = board.hexes[hexId];
        if (hex === undefined) return null;

        const pontos = pontosDoPoligono(cantosDoHexagono(hex.pixel));

        return (
          <g key={hexId} data-hex-legal={hexId}>
            <polygon
              points={pontos}
              fill="oklch(0.95 0.16 100 / 0.28)"
              stroke="oklch(0.95 0.16 100 / 0.9)"
              strokeWidth={3}
              pointerEvents="none"
            />
            <polygon
              points={pontos}
              fill="transparent"
              className="cursor-pointer focus:outline-none focus-visible:stroke-white focus-visible:stroke-2"
              role="button"
              tabIndex={0}
              aria-label={t.tabuleiro.moverSaqueadorPara(
                ROBBER_LABEL,
                nomeDoHexagono(board, hexId),
              )}
              onClick={() => {
                aoEscolherHex(hexId);
              }}
              onKeyDown={(e) => {
                // Mesmo par de teclas da `CamadaInterativa`, e mesmo motivo
                // para o `preventDefault`: um `<polygon>` não é botão de
                // verdade, e sem isto o Espaço rola a página.
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                aoEscolherHex(hexId);
              }}
            >
              <title>{t.tabuleiro.moverSaqueador}</title>
            </polygon>
          </g>
        );
      })}
    </g>
  );
}
