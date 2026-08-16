/**
 * A porta de persistência — §7 do roadmap.
 *
 * A estratégia está fixada em `docs/schema.sql` e é a razão de esta interface
 * ter a forma que tem: **a partida vive em memória e o banco é o diário**. Ao
 * subir, a sala é reconstruída pelo último snapshot mais o replay das ações
 * posteriores — o que só funciona porque o motor é determinístico e a semente do
 * PRNG mora dentro do estado.
 *
 * Duas implementações, pelo mesmo motivo que `RoomRegistryOptions` aceita
 * relógio injetado: `MemoryStore` deixa a suíte inteira rodar sem banco e torna
 * a lógica de restauração testável sem infraestrutura; `PostgresStore` é o que
 * roda de verdade. As duas passam pela mesma suíte de contrato.
 *
 * Tudo aqui é `Promise` mesmo quando a implementação é síncrona: quem chama
 * está atrás da fila do `GameRoom`, e o custo de esperar já foi pago no desenho
 * da M3.
 */

import type { Action, GameState, PlayerColor, VictoryBreakdown } from '@ilhavera/rules';
import type { RoomSettings } from '@ilhavera/protocol';

export type StoredPlayer = {
  id: string;
  nickname: string | null;
  /** Hex do SHA-256 do segredo. O segredo em si nunca é gravado. */
  secretHash: string;
  createdAt: number;
};

export type StoredSeat = {
  playerId: string;
  seatIndex: number;
  color: PlayerColor;
};

export type StoredRoomStatus = 'lobby' | 'playing' | 'finished' | 'abandoned';

export type StoredRoom = {
  id: string;
  code: string;
  hostId: string;
  status: StoredRoomStatus;
  settings: RoomSettings;
  createdAt: number;
  finishedAt: number | null;
  seats: StoredSeat[];
};

export type StoredSnapshot = {
  roomId: string;
  version: number;
  state: GameState;
};

export type StoredAction = {
  roomId: string;
  /** A `version` que esta ação produziu — o que torna o replay ordenável. */
  seq: number;
  playerId: string;
  action: Action;
};

/**
 * O resultado de uma partida encerrada — `game_results` de §7.
 *
 * Diferente de tudo o mais nesta porta, **não serve para restaurar nada**: uma
 * partida terminada não volta a ser jogada. É estatística, e é a única linha do
 * banco que existe para ser lida por gente em vez de por código.
 *
 * `scores` guarda a decomposição de todos, não só a do vencedor: "quem ganhou"
 * cabe em `winnerId`, mas "por quanto, e de onde vieram os pontos" é a pergunta
 * que alguém realmente faz depois — e reconstruí-la a partir do snapshot final
 * exigiria carregar o estado inteiro para somar seis números.
 */
export type StoredResult = {
  roomId: string;
  /** `null` numa partida encerrada sem vencedor (abandono). */
  winnerId: string | null;
  scores: Record<string, VictoryBreakdown>;
  turns: number;
  durationSeconds: number;
};

export interface Store {
  /** Cria ou atualiza. O `secretHash` só é escrito na criação. */
  savePlayer(player: StoredPlayer): Promise<void>;
  setPlayerNickname(id: string, nickname: string): Promise<void>;
  loadPlayers(): Promise<StoredPlayer[]>;

  /** Cria ou atualiza a sala inteira, assentos incluídos. */
  saveRoom(room: StoredRoom): Promise<void>;
  deleteRoom(id: string): Promise<void>;
  loadRooms(status: StoredRoomStatus): Promise<StoredRoom[]>;

  appendAction(entry: StoredAction): Promise<void>;
  saveSnapshot(snapshot: StoredSnapshot): Promise<void>;
  loadLatestSnapshot(roomId: string): Promise<StoredSnapshot | undefined>;
  /** Ações com `seq` **maior** que o informado, em ordem crescente. */
  loadActionsAfter(roomId: string, seq: number): Promise<StoredAction[]>;

  /** Idempotente: uma sala tem um resultado, e regravá-lo sobrescreve. */
  saveResult(result: StoredResult): Promise<void>;
  loadResult(roomId: string): Promise<StoredResult | undefined>;

  close(): Promise<void>;
}

/** Avisado quando uma gravação em segundo plano falha. */
export type OnWriteError = (erro: unknown, contexto: string) => void;

/**
 * Dispara uma gravação sem esperar por ela, sem deixar a rejeição escapar.
 *
 * Nem toda escrita pode ser esperada: o handshake não vai ficar parado
 * aguardando o banco só para emitir um token. Mas promessa rejeitada sem
 * tratamento derruba o processo Node — e perder o servidor inteiro porque o
 * `UPDATE` de um apelido falhou seria trocar um arranhão por uma amputação.
 */
export function gravarEmSegundoPlano(
  operacao: Promise<void>,
  contexto: string,
  onError: OnWriteError,
): void {
  operacao.catch((erro: unknown) => {
    onError(erro, contexto);
  });
}

/**
 * Serializa gravações por chave — na prática, por sala.
 *
 * Não é zelo: `game_actions` tem chave estrangeira para `rooms`, e o `INSERT`
 * da sala é disparado sem `await` no `room:start` enquanto o da primeira ação é
 * esperado dentro do `GameRoom`. Sem uma ordem comum, a ação chega antes da
 * sala existir e o banco recusa — um erro que só apareceria na primeira jogada
 * rápida de uma partida real, e nunca num teste tranquilo.
 *
 * Com a fila, esperar a gravação da ação espera junto tudo o que foi
 * enfileirado antes dela para aquela sala.
 */
export class WriteQueue {
  readonly #chains = new Map<string, Promise<void>>();

  enqueue(key: string, trabalho: () => Promise<void>): Promise<void> {
    const anterior = this.#chains.get(key) ?? Promise.resolve();
    const proximo = anterior.then(trabalho);

    // A cauda absorve a rejeição para não travar a fila nem escapar; quem
    // chamou continua recebendo o erro pela promessa devolvida.
    this.#chains.set(
      key,
      proximo.then(
        () => undefined,
        () => undefined,
      ),
    );
    return proximo;
  }

  /** Espera tudo o que já foi enfileirado para uma chave. */
  async settled(key: string): Promise<void> {
    await this.#chains.get(key);
  }

  esquecer(key: string): void {
    this.#chains.delete(key);
  }
}

/**
 * O caminho "sem persistência": aceita tudo e não guarda nada.
 *
 * É o padrão do `buildServer` para que o servidor continue subindo sem banco —
 * `make play`, os testes de socket e o desenvolvimento do cliente na Fase 3 não
 * deveriam depender de Postgres para existir.
 */
export class NullStore implements Store {
  async savePlayer(_player: StoredPlayer): Promise<void> {}
  async setPlayerNickname(_id: string, _nickname: string): Promise<void> {}
  async loadPlayers(): Promise<StoredPlayer[]> {
    return [];
  }
  async saveRoom(_room: StoredRoom): Promise<void> {}
  async deleteRoom(_id: string): Promise<void> {}
  async loadRooms(_status: StoredRoomStatus): Promise<StoredRoom[]> {
    return [];
  }
  async appendAction(_entry: StoredAction): Promise<void> {}
  async saveSnapshot(_snapshot: StoredSnapshot): Promise<void> {}
  async loadLatestSnapshot(_roomId: string): Promise<StoredSnapshot | undefined> {
    return undefined;
  }
  async loadActionsAfter(_roomId: string, _seq: number): Promise<StoredAction[]> {
    return [];
  }
  async saveResult(_result: StoredResult): Promise<void> {}
  async loadResult(_roomId: string): Promise<StoredResult | undefined> {
    return undefined;
  }
  async close(): Promise<void> {}
}
