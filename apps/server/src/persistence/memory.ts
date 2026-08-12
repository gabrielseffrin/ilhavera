/**
 * Persistência em memória — o mesmo contrato do Postgres, sem banco.
 *
 * Não é um dublê de teste que finge: guarda de verdade, com as mesmas chaves
 * primárias e a mesma semântica de sobrescrita. É isso que permite testar a
 * restauração de uma partida — snapshot mais replay — sem depender de
 * infraestrutura, e é a razão de a suíte de contrato rodar contra as duas
 * implementações.
 *
 * O que ela **não** faz é sobreviver ao processo. Para isso existe o Postgres.
 */

import type {
  StoredAction,
  StoredPlayer,
  StoredRoom,
  StoredRoomStatus,
  StoredSnapshot,
  Store,
} from './store.js';

/** Cópia profunda para que quem gravou não consiga alterar o gravado depois. */
function clonar<T>(valor: T): T {
  return structuredClone(valor);
}

export class MemoryStore implements Store {
  readonly #players = new Map<string, StoredPlayer>();
  readonly #rooms = new Map<string, StoredRoom>();
  /** `roomId` → `version` → snapshot. */
  readonly #snapshots = new Map<string, Map<number, StoredSnapshot>>();
  /** `roomId` → `seq` → ação. */
  readonly #actions = new Map<string, Map<number, StoredAction>>();

  async savePlayer(player: StoredPlayer): Promise<void> {
    const existente = this.#players.get(player.id);
    // O `secretHash` é imutável: quem já tem identidade não a troca por um
    // `savePlayer` posterior. Espelha o `ON CONFLICT DO UPDATE` do Postgres,
    // que também não toca no segredo.
    this.#players.set(player.id, {
      ...clonar(player),
      secretHash: existente?.secretHash ?? player.secretHash,
    });
  }

  async setPlayerNickname(id: string, nickname: string): Promise<void> {
    const existente = this.#players.get(id);
    if (existente !== undefined) existente.nickname = nickname;
  }

  async loadPlayers(): Promise<StoredPlayer[]> {
    return [...this.#players.values()].map(clonar);
  }

  async saveRoom(room: StoredRoom): Promise<void> {
    this.#rooms.set(room.id, clonar(room));
  }

  async deleteRoom(id: string): Promise<void> {
    // `ON DELETE CASCADE` no esquema: snapshots e ações vão junto.
    this.#rooms.delete(id);
    this.#snapshots.delete(id);
    this.#actions.delete(id);
  }

  async loadRooms(status: StoredRoomStatus): Promise<StoredRoom[]> {
    return [...this.#rooms.values()].filter((r) => r.status === status).map(clonar);
  }

  async appendAction(entry: StoredAction): Promise<void> {
    const daSala = this.#actions.get(entry.roomId) ?? new Map<number, StoredAction>();
    daSala.set(entry.seq, clonar(entry));
    this.#actions.set(entry.roomId, daSala);
  }

  async saveSnapshot(snapshot: StoredSnapshot): Promise<void> {
    const daSala = this.#snapshots.get(snapshot.roomId) ?? new Map<number, StoredSnapshot>();
    daSala.set(snapshot.version, clonar(snapshot));
    this.#snapshots.set(snapshot.roomId, daSala);
  }

  async loadLatestSnapshot(roomId: string): Promise<StoredSnapshot | undefined> {
    const daSala = this.#snapshots.get(roomId);
    if (daSala === undefined || daSala.size === 0) return undefined;

    const maior = Math.max(...daSala.keys());
    const encontrado = daSala.get(maior);
    return encontrado === undefined ? undefined : clonar(encontrado);
  }

  async loadActionsAfter(roomId: string, seq: number): Promise<StoredAction[]> {
    const daSala = this.#actions.get(roomId);
    if (daSala === undefined) return [];

    return [...daSala.values()]
      .filter((a) => a.seq > seq)
      .sort((a, b) => a.seq - b.seq)
      .map(clonar);
  }

  async close(): Promise<void> {}
}
