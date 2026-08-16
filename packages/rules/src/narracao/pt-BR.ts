/**
 * O texto dos eventos, em pt-BR — o único idioma escrito (Fase 5, M7).
 *
 * Até aqui estas 23 frases moravam num `switch` dentro de `narrate.ts`.
 * Continuam sendo exatamente as mesmas frases; o que mudou é que agora elas
 * formam um **dicionário indexado pelo tipo do evento**, o que torna um segundo
 * idioma um arquivo novo em vez de uma reescrita da função.
 *
 * `Record<GameEventType, …>` e não um mapa parcial: é a mesma escolha de
 * `ERROR_LABELS` e `ACTION_LABELS` em `labels.ts`, e pelo mesmo motivo — evento
 * novo sem frase **não compila**, que é a única forma de isto não apodrecer.
 * Vale duas vezes para texto, que é o que diverge calado: nenhum teste reclama
 * de uma frase desatualizada.
 *
 * **Nenhum pacote `en` foi escrito.** O roadmap pede "estrutura pronta para en",
 * e escrever a segunda tradução agora dobraria o texto a manter sem que ninguém
 * tivesse pedido para jogar em inglês. A estrutura é esta; o dia em que `en`
 * existir, ele é um arquivo ao lado deste.
 */

import {
  DEV_CARD_LABELS,
  LARGEST_ARMY_LABEL,
  LONGEST_ROAD_LABEL,
  RESOURCE_LABELS,
  ROBBER_LABEL,
} from '../labels.js';
import type { GameEvent } from '../state.js';
import type { PlayerId } from '../types.js';

/**
 * O que uma frase pode consultar além dos dados do próprio evento.
 *
 * Fechado de propósito: uma frase que precisasse do `GameState` inteiro
 * deixaria de ser tradução e passaria a ser regra escrita em outro lugar.
 */
export type ContextoDeNarracao = {
  /** O nome de um jogador, já com o enfeite de quem chamou (ANSI, na CLI). */
  quem: (id: PlayerId) => string;
  vertice: (id: string) => string;
  aresta: (id: string) => string;
  hex: (id: string) => string;
  recursos: (counts: Record<string, number>) => string;
};

/** Uma frase por tipo de evento, recebendo o evento já estreitado. */
export type PacoteDeNarracao = {
  [K in GameEvent['type']]: (
    evento: Extract<GameEvent, { type: K }>,
    ctx: ContextoDeNarracao,
  ) => string;
};

export const NARRACAO_PT_BR: PacoteDeNarracao = {
  gameStarted: (e) => `Partida iniciada (semente ${e.data.seed}).`,

  settlementPlaced: (e, c) =>
    `${c.quem(e.actor)} colocou um assentamento em ${c.vertice(e.data.vertexId)}.`,

  roadPlaced: (e, c) =>
    `${c.quem(e.actor)} colocou uma estrada ${c.aresta(e.data.edgeId)}${
      e.data.free ? ' (grátis)' : ''
    }.`,

  cityBuilt: (e, c) => `${c.quem(e.actor)} construiu uma cidade em ${c.vertice(e.data.vertexId)}.`,

  diceRolled: (e, c) =>
    `${c.quem(e.actor)} rolou ${e.data.dice[0]} + ${e.data.dice[1]} = ${e.data.total}.`,

  resourcesProduced: (e, c) => {
    const ganhos = Object.entries(e.data.gains)
      .map(([id, counts]) => `${c.quem(id)}: ${c.recursos(counts)}`)
      .join(' | ');
    const bloqueados =
      e.data.blockedByBank.length === 0
        ? ''
        : ` (banco sem estoque: ${e.data.blockedByBank.map((r) => RESOURCE_LABELS[r]).join(', ')})`;
    return `Produção — ${ganhos === '' ? 'ninguém produziu' : ganhos}${bloqueados}`;
  },

  setupProduction: (e, c) =>
    `${c.quem(e.actor)} recebeu ${c.recursos(e.data.gains)} pelo segundo assentamento.`,

  discardRequired: (e, c) => {
    const alvos = Object.entries(e.data.counts)
      .map(([id, n]) => `${c.quem(id)} (${n})`)
      .join(', ');
    return `Saiu 7 — descarte obrigatório: ${alvos}.`;
  },

  discarded: (e, c) => `${c.quem(e.actor)} descartou ${c.recursos(e.data.resources)}.`,

  robberMoved: (e, c) => `${c.quem(e.actor)} moveu o ${ROBBER_LABEL} para ${c.hex(e.data.hexId)}.`,

  stolen: (e, c) => {
    /**
     * `resource` vem nulo quando quem lê não é ladrão nem vítima: a projeção de
     * §4.5 filtra o log, não só o estado. A frase precisa funcionar nos dois
     * casos, e é aqui que isso se decide — não em quem chama.
     */
    const carta = e.data.resource === null ? 'uma carta' : `1× ${RESOURCE_LABELS[e.data.resource]}`;
    return `${c.quem(e.actor)} roubou ${carta} de ${c.quem(e.data.from)}.`;
  },

  devCardBought: (e, c) =>
    `${c.quem(e.actor)} comprou uma Carta de Progresso (restam ${e.data.deckLeft}).`,

  devCardPlayed: (e, c) => `${c.quem(e.actor)} jogou ${DEV_CARD_LABELS[e.data.card]}.`,

  monopolyResolved: (e, c) => {
    const total = Object.values(e.data.taken).reduce((a, b) => a + b, 0);
    return `Monopólio de ${RESOURCE_LABELS[e.data.resource]}: ${c.quem(e.actor)} recolheu ${total} carta(s).`;
  },

  yearOfPlentyResolved: (e, c) =>
    `${c.quem(e.actor)} pegou ${e.data.resources.map((r) => RESOURCE_LABELS[r]).join(' + ')} do banco.`,

  bankTraded: (e, c) =>
    `${c.quem(e.actor)} trocou ${e.data.rate}× ${RESOURCE_LABELS[e.data.give]} por 1× ${
      RESOURCE_LABELS[e.data.receive]
    }.`,

  tradeOffered: (e, c) =>
    `${c.quem(e.actor)} propôs ${c.recursos(e.data.terms.give)} por ${c.recursos(
      e.data.terms.receive,
    )}.`,

  tradeResponded: (e, c) => {
    const r = e.data.response;
    const texto =
      r.type === 'accept' ? 'aceitou' : r.type === 'decline' ? 'recusou' : 'contrapropôs';
    return `${c.quem(e.actor)} ${texto} a proposta.`;
  },

  tradeCompleted: (e, c) => `${c.quem(e.actor)} fechou negócio com ${c.quem(e.data.partner)}.`,

  longestRoadChanged: (e, c) =>
    e.data.owner === null
      ? `${LONGEST_ROAD_LABEL} ficou sem dono.`
      : `${LONGEST_ROAD_LABEL} (${e.data.length}) agora é de ${c.quem(e.data.owner)}.`,

  largestArmyChanged: (e, c) =>
    e.data.owner === null
      ? `${LARGEST_ARMY_LABEL} ficou sem dono.`
      : `${LARGEST_ARMY_LABEL} (${e.data.size}) agora é de ${c.quem(e.data.owner)}.`,

  turnEnded: (e, c) => `Turno ${e.data.turnNumber}: vez de ${c.quem(e.data.nextPlayer)}.`,

  gameWon: (e, c) => `🏆 ${c.quem(e.actor)} venceu com ${e.data.victoryPoints} pontos de vitória!`,
};
