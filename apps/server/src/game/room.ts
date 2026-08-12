/**
 * A partida viva de uma sala — o motor atrás de uma porta só.
 *
 * Duas coisas moram aqui e em nenhum outro lugar do servidor: **o estado atual
 * da partida** e **o que já foi respondido a quem**. Quem quiser mudar o estado
 * chama `submit`; quem quiser lê-lo passa por `view`.
 *
 * ## Sobre a fila
 *
 * Hoje a fila não conserta nenhum bug: `reduce` é síncrono e puro, Node é
 * single-threaded, e não existe um `await` entre ler e escrever o estado. Ela é
 * costura, não conserto — e existe porque `submit` já nasce assíncrono, de modo
 * que a M5 (gravar `game_snapshots` e `game_actions` antes de responder o ack)
 * caiba sem reescrever a borda de socket nem os testes. Removê-la agora "porque
 * não faz nada" é trocar doze linhas por uma reescrita depois.
 *
 * **Em memória neste marco**, como o registro de salas. A M5 troca o que está
 * atrás de `submit`, não a assinatura.
 */

import {
  createGame,
  projectEvents,
  reduce,
  toClientView,
  type Action,
  type ClientView,
  type CreateGameOptions,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@ilhavera/rules';
import type { Ack } from '@ilhavera/protocol';

/**
 * Quantas respostas por sala ficam guardadas para reenvio. Sem TTL de propósito:
 * um teto já limita a memória, e o resto é limitado pelo tempo de vida da sala
 * (ADR-003). TTL exigiria relógio e varredura para proteger contra um vazamento
 * que não existe.
 */
export const MAX_REQUEST_LOG = 256;

export type SubmitInput = {
  playerId: PlayerId;
  requestId: string;
  action: Action;
};

export type SubmitAck = Ack<{ version: number }>;

export type SubmitResult = {
  ack: SubmitAck;
  /** `false` quando o `requestId` já tinha resposta: nada foi aplicado, nada a emitir. */
  applied: boolean;
  events: readonly GameEvent[];
};

export type GameRoomOptions = CreateGameOptions & {
  /** Injetável para o teste exercitar a expulsão do log sem 256 comandos. */
  maxRequestLog?: number;
};

export class GameRoom {
  #state: GameState;
  #tail: Promise<void> = Promise.resolve();
  readonly #respostas = new Map<string, SubmitAck>();
  readonly #maxRequestLog: number;

  private constructor(state: GameState, maxRequestLog: number) {
    this.#state = state;
    this.#maxRequestLog = maxRequestLog;
  }

  static create(options: GameRoomOptions): GameRoom {
    const { maxRequestLog, ...criacao } = options;
    return new GameRoom(createGame(criacao), maxRequestLog ?? MAX_REQUEST_LOG);
  }

  /** Leitura apenas: depois do primeiro `reduce` o immer congela tudo. */
  get state(): GameState {
    return this.#state;
  }

  get version(): number {
    return this.#state.version;
  }

  view(viewerId: PlayerId | null): ClientView {
    return toClientView(this.#state, viewerId);
  }

  /** Eventos de uma jogada, filtrados para um espectador — o corpo do `state:patch`. */
  patchFor(events: readonly GameEvent[], viewerId: PlayerId | null): GameEvent[] {
    return projectEvents(events, viewerId);
  }

  /**
   * Aplica uma ação. Idempotente por `requestId`: reenvio devolve a resposta
   * original **verbatim, inclusive quando foi erro**. É o ponto inteiro da
   * idempotência — quem perdeu o ack e reenviou tem que receber a mesma coisa,
   * não `NOT_YOUR_TURN` porque o turno andou nesse meio-tempo. E guardar também
   * as rejeições evita o pior caso: um retry esquecido ser aplicado por acaso
   * quando a vez voltar.
   */
  submit(input: SubmitInput): Promise<SubmitResult> {
    return this.#enfileirar(() => this.#aplicar(input));
  }

  #aplicar({ playerId, requestId, action }: SubmitInput): SubmitResult {
    const chave = `${playerId}:${requestId}`;
    const anterior = this.#respostas.get(chave);
    if (anterior !== undefined) {
      return { ack: anterior, applied: false, events: [] };
    }

    const resultado = reduce(this.#state, action);
    if (!resultado.ok) {
      const ack: SubmitAck = { ok: false, error: resultado.error };
      this.#registrar(chave, ack);
      return { ack, applied: false, events: [] };
    }

    this.#state = resultado.state;
    const ack: SubmitAck = { ok: true, data: { version: resultado.state.version } };
    this.#registrar(chave, ack);
    return { ack, applied: true, events: resultado.events };
  }

  #registrar(chave: string, ack: SubmitAck): void {
    this.#respostas.set(chave, ack);
    if (this.#respostas.size <= this.#maxRequestLog) return;

    // `Map` preserva ordem de inserção, então a primeira chave é a mais antiga.
    const maisAntiga = this.#respostas.keys().next();
    if (maisAntiga.done !== true) this.#respostas.delete(maisAntiga.value);
  }

  /**
   * Espelha a conexão dentro do estado da partida — o único campo que o
   * servidor escreve no `GameState` (ADR-003).
   *
   * Cópia em vez de mutação porque o immer congela o estado depois do primeiro
   * `reduce`. E **não mexe em `version`**: `version` conta ações do motor e é a
   * base do replay determinístico (§4.1). Conexão não é ação; incrementar aqui
   * faria o replay divergir do log.
   */
  setConnected(playerId: PlayerId, connected: boolean): void {
    const alvo = this.#state.players.find((p) => p.id === playerId);
    if (alvo === undefined || alvo.connected === connected) return;

    this.#state = {
      ...this.#state,
      players: this.#state.players.map((p) => (p.id === playerId ? { ...p, connected } : p)),
    };
  }

  #enfileirar<T>(trabalho: () => T): Promise<T> {
    const resultado = this.#tail.then(trabalho);
    // Absorve a rejeição só na cauda: quem chamou continua recebendo o erro.
    this.#tail = resultado.then(
      () => undefined,
      () => undefined,
    );
    return resultado;
  }
}
