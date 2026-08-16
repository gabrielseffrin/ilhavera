/**
 * O relógio de turno e o auto-passe — §11, questão 5.
 *
 * Existe para um caso só, e é um caso real: alguém fecha a aba no meio do
 * próprio turno e os outros três ficam olhando para uma mesa que não anda.
 * Desligado por padrão, porque partida entre amigos raramente quer cronômetro.
 *
 * ## O motor não sabe que isto existe
 *
 * `packages/rules` não pode ler o relógio — é regra de lint, verificada no CI, e
 * é o que sustenta o replay determinístico. Então nada aqui vira ação nova nem
 * campo novo no estado. Ao estourar o prazo, este módulo **submete uma jogada
 * legal** pelo mesmo `GameRoom.submit` de todo mundo, com `requestId` próprio.
 * Não há caminho privilegiado que pule a fila, a idempotência ou a persistência:
 * do ponto de vista do motor, o jogador jogou.
 *
 * Consequência boa e de graça: o log de ações continua reproduzindo a partida
 * inteira, auto-passes incluídos. Uma jogada automática que não passasse pelo
 * diário quebraria o replay no primeiro turno abandonado.
 *
 * ## Por que `tick()` em vez de `setTimeout` por sala
 *
 * Um `setTimeout` por sala precisaria ser cancelado e recriado a cada jogada —
 * são centenas por partida — e um esquecido dispara sobre um estado que já
 * mudou. Com um prazo guardado e uma varredura de um em um segundo, o estado é
 * conferido no momento em que a decisão é tomada, e o teste chama `tick()` com o
 * relógio que quiser em vez de esperar de verdade.
 */

import type { FastifyBaseLogger } from 'fastify';

import { activePlayers, enumerateLegalActions, type Action, type PlayerId } from '@ilhavera/rules';

import type { Room, RoomRegistry } from '../rooms/registry.js';

/** De quanto em quanto tempo a varredura roda, em produção. */
export const INTERVALO_DA_VARREDURA = 1000;

export type TurnTimerDeps = {
  rooms: RoomRegistry;
  log: FastifyBaseLogger;
  /**
   * Aplica a jogada automática e propaga o resultado. Injetado em vez de
   * importado para que este módulo não conheça o Socket.IO: quem sabe emitir
   * `state:patch` é `protocol/game.ts`, e é lá que a emissão continua.
   */
  jogar: (room: Room, playerId: PlayerId, action: Action) => Promise<void>;
  now?: () => number;
};

export class TurnTimer {
  readonly #rooms: RoomRegistry;
  readonly #log: FastifyBaseLogger;
  readonly #jogar: TurnTimerDeps['jogar'];
  readonly #now: () => number;

  /** `código da sala` → instante em que a paciência acaba. */
  readonly #prazos = new Map<string, number>();
  #sequencia = 0;

  constructor(deps: TurnTimerDeps) {
    this.#rooms = deps.rooms;
    this.#log = deps.log;
    this.#jogar = deps.jogar;
    this.#now = deps.now ?? Date.now;
  }

  /**
   * Reinicia a contagem. Chamado a cada jogada aceita e no `room:start`.
   *
   * Uma jogada de qualquer um zera o relógio de todos, e é o correto: o prazo é
   * da **mesa**, não do jogador. No descarte paralelo, todo mundo começou a
   * contar na mesma rolagem e não há razão para uns terem mais tempo que outros.
   */
  reagendar(room: Room): void {
    const segundos = room.settings.turnSeconds;
    if (segundos == null || room.game === null || room.status !== 'playing') {
      this.#prazos.delete(room.code);
      return;
    }
    this.#prazos.set(room.code, this.#now() + segundos * 1000);
  }

  cancelar(code: string): void {
    this.#prazos.delete(code);
  }

  /** O prazo desta sala, para viajar no snapshot e no patch. */
  prazoDe(room: Room): number | null {
    return this.#prazos.get(room.code) ?? null;
  }

  /**
   * Varre os prazos e resolve os que venceram.
   *
   * Sequencial e não `Promise.all`: `jogar` passa pela fila da sala, e disparar
   * várias de uma vez faria o segundo auto-passe ser escolhido a partir de um
   * estado que o primeiro já mudou.
   */
  async tick(): Promise<void> {
    const agora = this.#now();
    const vencidos = [...this.#prazos].filter(([, prazo]) => prazo <= agora).map(([code]) => code);

    for (const code of vencidos) {
      const room = this.#rooms.byCode(code);
      if (room === undefined || room.game === null || room.status !== 'playing') {
        this.#prazos.delete(code);
        continue;
      }
      await this.#estourar(room);
    }
  }

  async #estourar(room: Room): Promise<void> {
    const game = room.game;
    if (game === null) return;

    /**
     * Quem a mesa espera — `activePlayers` já responde isso, inclusive nos dois
     * casos que um relógio ingênuo erra: o descarte, em que vários agem ao mesmo
     * tempo, e a proposta de troca aberta, em que quem trava a mesa não é o
     * jogador da vez.
     */
    const esperados = activePlayers(game.state);

    /**
     * Reagenda **antes** de jogar. Se ficasse depois, uma jogada automática que
     * explodisse deixaria o prazo vencido no mapa e a varredura seguinte tentaria
     * de novo, e de novo, uma vez por segundo.
     */
    this.reagendar(room);

    for (const playerId of esperados) {
      const acao = jogadaAutomatica(enumerateLegalActions(game.state, playerId));
      if (acao === null) continue;

      this.#log.info(
        { code: room.code, playerId, jogada: acao.type },
        'prazo esgotado: jogada automática',
      );
      await this.#jogar(room, playerId, acao);
    }
  }

  /** `requestId` próprio, para não colidir com o de nenhum cliente. */
  proximoRequestId(): string {
    return `auto-${++this.#sequencia}`;
  }
}

/**
 * O que jogar por quem não jogou.
 *
 * A ordem não é arbitrária: é "o mínimo que destrava a mesa, e o menos
 * prejudicial possível para quem não está aqui".
 *
 * - `rollDice` primeiro porque rolar é **obrigatório** (§3.3) e não é escolha —
 *   não há como prejudicar ninguém rolando por ele;
 * - `discard` e `moveRobber` porque a mesa não anda enquanto não acontecerem. O
 *   descarte usa a primeira heurística de `legal.ts`, a mesma que o botão
 *   "automático" da interface oferece;
 * - as colocações do setup porque uma partida travada no setup nunca começa;
 * - `endTurn` por último e por padrão: na fase principal, **não fazer nada** é a
 *   jogada menos prejudicial que existe. Um auto-passe que construísse ou
 *   comprasse cartas gastaria os recursos de quem está ausente.
 *
 * `tradeRespond` entra com `decline`: recusar em silêncio é o que uma pessoa
 * ausente faz, e aceitar por ela entregaria recursos que ela não ofereceu.
 */
export function jogadaAutomatica(legais: readonly Action[]): Action | null {
  const primeira = (tipo: Action['type']): Action | undefined =>
    legais.find((a) => a.type === tipo);

  const recusa = legais.find((a) => a.type === 'tradeRespond' && a.response.type === 'decline');

  return (
    primeira('rollDice') ??
    primeira('discard') ??
    primeira('moveRobber') ??
    recusa ??
    primeira('placeSettlement') ??
    primeira('placeRoad') ??
    primeira('endTurn') ??
    null
  );
}
