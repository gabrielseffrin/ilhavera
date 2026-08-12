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

import type { Action, GameState, PlayerColor } from '@ilhavera/rules';
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

  close(): Promise<void>;
}

/**
 * O caminho "sem persistência": aceita tudo e não guarda nada.
 *
 * É o padrão do `buildServer` para que o servidor continue subindo sem banco —
 * `make play`, os testes de socket e o desenvolvimento do cliente na Fase 3 não
 * deveriam depender de Postgres para existir.
 */
export class NullStore implements Store {
  async savePlayer(): Promise<void> {}
  async setPlayerNickname(): Promise<void> {}
  async loadPlayers(): Promise<StoredPlayer[]> {
    return [];
  }
  async saveRoom(): Promise<void> {}
  async deleteRoom(): Promise<void> {}
  async loadRooms(): Promise<StoredRoom[]> {
    return [];
  }
  async appendAction(): Promise<void> {}
  async saveSnapshot(): Promise<void> {}
  async loadLatestSnapshot(): Promise<StoredSnapshot | undefined> {
    return undefined;
  }
  async loadActionsAfter(): Promise<StoredAction[]> {
    return [];
  }
  async close(): Promise<void> {}
}
