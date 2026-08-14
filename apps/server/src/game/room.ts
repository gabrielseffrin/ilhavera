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
  enumerateLegalActions,
  projectEvents,
  reduce,
  toClientView,
  toClientViewDynamic,
  type Action,
  type ClientView,
  type ClientViewDynamic,
  type CreateGameOptions,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '@ilhavera/rules';
import type { AckErrorCode, SnapshotPayload } from '@ilhavera/protocol';

import {
  gravarEmSegundoPlano,
  NullStore,
  WriteQueue,
  type OnWriteError,
  type Store,
} from '../persistence/store.js';

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

/**
 * O `Ack` do contrato declara `error: string` de propósito, para que o cliente
 * tolere um código que a versão dele não conhece. Aqui dentro, onde o código é
 * produzido, ele é estreito: sem isso o `game:error` seria emitido com uma
 * `string` qualquer e o compilador não teria como reclamar.
 */
export type SubmitAck =
  { ok: true; data: { version: number } } | { ok: false; error: AckErrorCode };

export type SubmitResult = {
  ack: SubmitAck;
  /** `true` quando o estado mudou — e só então há `state:patch` para emitir. */
  applied: boolean;
  /**
   * `true` quando o `requestId` já tinha resposta e ela foi repetida. Separado
   * de `applied` porque a borda precisa distinguir "recusado agora" de
   * "recusado antes, e você está perguntando de novo": só o primeiro vira
   * `game:error`.
   */
  deduped: boolean;
  events: readonly GameEvent[];
};

export type GameRoomPersistence = {
  store?: Store;
  /** Compartilhada com o `RoomRegistry`: a sala precisa existir antes da ação. */
  writes?: WriteQueue;
  onWriteError?: OnWriteError;
};

export type GameRoomOptions = CreateGameOptions &
  GameRoomPersistence & {
    /** Injetável para o teste exercitar a expulsão do log sem 256 comandos. */
    maxRequestLog?: number;
  };

export class GameRoom {
  #state: GameState;
  #tail: Promise<void> = Promise.resolve();
  readonly #respostas = new Map<string, SubmitAck>();
  readonly #maxRequestLog: number;
  readonly #store: Store;
  readonly #writes: WriteQueue;
  readonly #onWriteError: OnWriteError;

  private constructor(state: GameState, maxRequestLog: number, persistencia: GameRoomPersistence) {
    this.#state = state;
    this.#maxRequestLog = maxRequestLog;
    this.#store = persistencia.store ?? new NullStore();
    this.#writes = persistencia.writes ?? new WriteQueue();
    this.#onWriteError = persistencia.onWriteError ?? ((): void => {});
  }

  static create(options: GameRoomOptions): GameRoom {
    const { maxRequestLog, store, writes, onWriteError, ...criacao } = options;
    const room = new GameRoom(createGame(criacao), maxRequestLog ?? MAX_REQUEST_LOG, {
      ...(store === undefined ? {} : { store }),
      ...(writes === undefined ? {} : { writes }),
      ...(onWriteError === undefined ? {} : { onWriteError }),
    });

    /**
     * Snapshot da versão 0. É ele que carrega a semente e o tabuleiro sorteado
     * para o banco — sem isso a restauração não teria de onde partir, já que
     * `rooms` não guarda semente. Vai pela fila, então assenta depois do
     * `INSERT` da sala.
     */
    room.#gravarSnapshot();
    return room;
  }

  /**
   * Reconstrói a partida a partir do que foi gravado. Não valida o estado: quem
   * chama acabou de tirá-lo do banco e o replay das ações seguintes é a
   * verificação de verdade — ação que não se aplica ao estado restaurado é
   * sinal de que o estado não é o que dizia ser.
   */
  static fromState(state: GameState, persistencia: GameRoomPersistence = {}): GameRoom {
    return new GameRoom(state, MAX_REQUEST_LOG, persistencia);
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

  /** A metade da projeção que muda — o corpo do `state:patch`. */
  dynamicFor(viewerId: PlayerId | null): ClientViewDynamic {
    return toClientViewDynamic(this.#state, viewerId);
  }

  /**
   * As jogadas legais de um jogador. Sai daqui e não do navegador porque
   * enumerar exige o `GameState` cru: `isLegal` de `tradeConfirm` confere a mão
   * do **parceiro**, que é exatamente o que a projeção esconde. Um enumerador
   * sobre a projeção não seria uma segunda implementação das regras — seria uma
   * implementação errada, respondendo com menos do que a pergunta exige.
   */
  legalFor(viewerId: PlayerId): Action[] {
    const legais = enumerateLegalActions(this.#state, viewerId);
    const sonda = this.#sondaDeProposta(viewerId);
    return sonda === undefined ? legais : [...legais, sonda];
  }

  /**
   * Uma proposta de comércio, só para dizer que o caminho está aberto.
   *
   * O botão "propor troca" precisa existir **antes** de a proposta existir, e a
   * interface só desenha o que está na lista. Mandar a amostra inteira que
   * `includeTradeOffers` gera resolveria e custaria caro em dois sentidos: são
   * ~1,5 KB por patch por jogador de propostas que ninguém vai clicar, e um menu
   * de vinte trocas 1:1 é uma interface pior do que a de compor os termos.
   *
   * Então vai uma, a primeira que o motor aceitou. Quem decide se dá para propor
   * continua sendo `isLegal`, e não uma condição de fase reescrita no navegador.
   */
  #sondaDeProposta(viewerId: PlayerId): Action | undefined {
    return enumerateLegalActions(this.#state, viewerId, { includeTradeOffers: true }).find(
      (a) => a.type === 'tradeOffer',
    );
  }

  /** Estado completo mais as jogadas legais — o corpo do `state:snapshot`. */
  snapshotFor(viewerId: PlayerId): SnapshotPayload {
    return { view: this.view(viewerId), legal: this.legalFor(viewerId) };
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

  async #aplicar({ playerId, requestId, action }: SubmitInput): Promise<SubmitResult> {
    const chave = `${playerId}:${requestId}`;
    const anterior = this.#respostas.get(chave);
    if (anterior !== undefined) {
      return { ack: anterior, applied: false, deduped: true, events: [] };
    }

    const resultado = reduce(this.#state, action);
    if (!resultado.ok) {
      const ack: SubmitAck = { ok: false, error: resultado.error };
      this.#registrar(chave, ack);
      // Jogada recusada não vira linha no diário: o log de ações é o que o
      // replay reproduz, e reproduzir uma recusa não leva a lugar nenhum.
      return { ack, applied: false, deduped: false, events: [] };
    }

    this.#state = resultado.state;
    const ack: SubmitAck = { ok: true, data: { version: resultado.state.version } };
    this.#registrar(chave, ack);

    await this.#gravarJogada(playerId, action, resultado.events);

    return { ack, applied: true, deduped: false, events: resultado.events };
  }

  /**
   * O diário da jogada: a ação sempre, o snapshot ao fim de cada turno — a
   * política que `docs/schema.sql` fixou. O snapshot limita o replay ao turno
   * corrente em vez da partida inteira.
   *
   * Esperada, ao contrário das gravações de sala, porque é isto que a fila da
   * M3 existia para permitir: quando o cliente recebe o ack, a jogada está no
   * banco. **Falha de gravação não desfaz a jogada** — ela já aconteceu, e
   * mentir no ack seria pior que perder o diário. O erro é registrado e a
   * partida segue; a próxima gravação de snapshot recompõe o que se perdeu.
   */
  async #gravarJogada(
    playerId: PlayerId,
    action: Action,
    events: readonly GameEvent[],
  ): Promise<void> {
    const roomId = this.#state.id;
    const seq = this.#state.version;
    const fimDeTurno = events.some((e) => e.type === 'turnEnded');
    const estado = this.#state;

    try {
      await this.#writes.enqueue(roomId, async () => {
        await this.#store.appendAction({ roomId, seq, playerId, action });
        if (fimDeTurno) await this.#store.saveSnapshot({ roomId, version: seq, state: estado });
      });
    } catch (erro) {
      this.#onWriteError(erro, 'gravarJogada');
    }
  }

  #gravarSnapshot(): void {
    const roomId = this.#state.id;
    const version = this.#state.version;
    const state = this.#state;

    gravarEmSegundoPlano(
      this.#writes.enqueue(roomId, () => this.#store.saveSnapshot({ roomId, version, state })),
      'saveSnapshot',
      this.#onWriteError,
    );
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

  #enfileirar<T>(trabalho: () => T | Promise<T>): Promise<T> {
    const resultado = this.#tail.then(trabalho);
    // Absorve a rejeição só na cauda: quem chamou continua recebendo o erro.
    this.#tail = resultado.then(
      () => undefined,
      () => undefined,
    );
    return resultado;
  }
}
