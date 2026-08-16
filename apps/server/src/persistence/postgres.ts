/**
 * Persistência em Postgres — a implementação que roda de verdade.
 *
 * Passa pela mesma suíte de contrato da `MemoryStore`, que é o que impede as
 * duas de divergirem em silêncio.
 *
 * Duas escolhas que merecem justificativa:
 *
 * - **Migração no boot**, e não num comando manual. Um `migrate` que alguém
 *   precisa lembrar de rodar no deploy é um `migrate` que não roda no dia do
 *   rollback às duas da manhã.
 * - **`createdAt` vai e volta como epoch em milissegundos.** A coluna é
 *   `timestamptz` porque é o tipo certo no banco, mas o resto do servidor conta
 *   tempo em número — `RoomRegistry` já recebe um relógio injetado assim, e
 *   converter na borda é mais barato que espalhar `Date` pelo domínio.
 */

import { fileURLToPath } from 'node:url';

import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import type { PlayerColor } from '@ilhavera/rules';

import { gameActions, gameResults, gameSnapshots, players, roomPlayers, rooms } from './schema.js';
import type {
  StoredAction,
  StoredPlayer,
  StoredResult,
  StoredRoom,
  StoredRoomStatus,
  StoredSnapshot,
  Store,
} from './store.js';

/**
 * Funciona tanto de `src/` (tsx, vitest) quanto de `dist/`: os dois estão um
 * nível abaixo da raiz do pacote, onde mora `drizzle/`.
 */
const MIGRACOES = fileURLToPath(new URL('../../drizzle', import.meta.url));

export type PostgresStoreOptions = {
  url: string;
  /** Conexões simultâneas. O default do `pg` é 10, o que já basta para o MVP. */
  max?: number;
};

export class PostgresStore implements Store {
  readonly #pool: Pool;
  readonly #db: NodePgDatabase;

  private constructor(pool: Pool) {
    this.#pool = pool;
    this.#db = drizzle(pool);
  }

  /** Abre a conexão e deixa o esquema no dia. */
  static async connect(options: PostgresStoreOptions): Promise<PostgresStore> {
    const pool = new Pool({
      connectionString: options.url,
      ...(options.max === undefined ? {} : { max: options.max }),
    });

    const store = new PostgresStore(pool);
    await migrate(store.#db, { migrationsFolder: MIGRACOES });
    return store;
  }

  async savePlayer(player: StoredPlayer): Promise<void> {
    await this.#db
      .insert(players)
      .values({
        id: player.id,
        nickname: player.nickname,
        secretHash: player.secretHash,
        createdAt: new Date(player.createdAt),
      })
      // O segredo fica de fora do `UPDATE` de propósito: regravar um jogador
      // não pode invalidar o token que ele já guardou no `localStorage`.
      .onConflictDoUpdate({
        target: players.id,
        set: { nickname: player.nickname },
      });
  }

  async setPlayerNickname(id: string, nickname: string): Promise<void> {
    await this.#db.update(players).set({ nickname }).where(eq(players.id, id));
  }

  async loadPlayers(): Promise<StoredPlayer[]> {
    const linhas = await this.#db.select().from(players);
    return linhas.map((l) => ({
      id: l.id,
      nickname: l.nickname,
      secretHash: l.secretHash,
      createdAt: l.createdAt.getTime(),
    }));
  }

  /**
   * A sala inteira numa transação. Os assentos são regravados do zero em vez de
   * reconciliados: a lista tem no máximo quatro linhas, e um `delete` seguido de
   * `insert` não tem como deixar assento fantasma para trás.
   */
  async saveRoom(room: StoredRoom): Promise<void> {
    await this.#db.transaction(async (tx) => {
      await tx
        .insert(rooms)
        .values({
          id: room.id,
          code: room.code,
          hostId: room.hostId,
          status: room.status,
          settings: room.settings,
          createdAt: new Date(room.createdAt),
          finishedAt: room.finishedAt === null ? null : new Date(room.finishedAt),
        })
        .onConflictDoUpdate({
          target: rooms.id,
          set: {
            hostId: room.hostId,
            status: room.status,
            settings: room.settings,
            finishedAt: room.finishedAt === null ? null : new Date(room.finishedAt),
          },
        });

      await tx.delete(roomPlayers).where(eq(roomPlayers.roomId, room.id));
      if (room.seats.length > 0) {
        await tx.insert(roomPlayers).values(
          room.seats.map((s) => ({
            roomId: room.id,
            playerId: s.playerId,
            seatIndex: s.seatIndex,
            color: s.color,
          })),
        );
      }
    });
  }

  async deleteRoom(id: string): Promise<void> {
    // Snapshots, ações e assentos saem por `ON DELETE CASCADE`.
    await this.#db.delete(rooms).where(eq(rooms.id, id));
  }

  async loadRooms(status: StoredRoomStatus): Promise<StoredRoom[]> {
    const linhas = await this.#db.select().from(rooms).where(eq(rooms.status, status));
    if (linhas.length === 0) return [];

    const encontradas: StoredRoom[] = [];
    for (const l of linhas) {
      const assentos = await this.#db
        .select()
        .from(roomPlayers)
        .where(eq(roomPlayers.roomId, l.id))
        .orderBy(asc(roomPlayers.seatIndex));

      encontradas.push({
        id: l.id,
        // `char(6)` vem preenchido com espaços à direita.
        code: l.code.trim(),
        hostId: l.hostId,
        status: l.status as StoredRoomStatus,
        settings: l.settings,
        createdAt: l.createdAt.getTime(),
        finishedAt: l.finishedAt === null ? null : l.finishedAt.getTime(),
        seats: assentos.map((a) => ({
          playerId: a.playerId,
          seatIndex: a.seatIndex,
          color: a.color as PlayerColor,
        })),
      });
    }
    return encontradas;
  }

  async appendAction(entry: StoredAction): Promise<void> {
    await this.#db
      .insert(gameActions)
      .values({
        roomId: entry.roomId,
        seq: entry.seq,
        playerId: entry.playerId,
        action: entry.action,
      })
      // Append-only, mas idempotente: reaplicar a mesma `seq` na restauração
      // não pode derrubar o servidor.
      .onConflictDoNothing({ target: [gameActions.roomId, gameActions.seq] });
  }

  async saveSnapshot(snapshot: StoredSnapshot): Promise<void> {
    await this.#db
      .insert(gameSnapshots)
      .values({
        roomId: snapshot.roomId,
        version: snapshot.version,
        state: snapshot.state,
      })
      .onConflictDoUpdate({
        target: [gameSnapshots.roomId, gameSnapshots.version],
        set: { state: snapshot.state },
      });
  }

  async loadLatestSnapshot(roomId: string): Promise<StoredSnapshot | undefined> {
    const [linha] = await this.#db
      .select()
      .from(gameSnapshots)
      .where(eq(gameSnapshots.roomId, roomId))
      .orderBy(desc(gameSnapshots.version))
      .limit(1);

    if (linha === undefined) return undefined;
    return { roomId: linha.roomId, version: linha.version, state: linha.state };
  }

  async loadActionsAfter(roomId: string, seq: number): Promise<StoredAction[]> {
    const linhas = await this.#db
      .select()
      .from(gameActions)
      .where(and(eq(gameActions.roomId, roomId), gt(gameActions.seq, seq)))
      .orderBy(asc(gameActions.seq));

    return linhas.map((l) => ({
      roomId: l.roomId,
      seq: l.seq,
      playerId: l.playerId ?? '',
      action: l.action,
    }));
  }

  async saveResult(result: StoredResult): Promise<void> {
    await this.#db
      .insert(gameResults)
      .values({
        roomId: result.roomId,
        winnerId: result.winnerId,
        scores: result.scores,
        turns: result.turns,
        durationS: result.durationSeconds,
      })
      // Regravar não pode explodir: a jogada da vitória pode ser reaplicada num
      // replay de restauração, e derrubar o servidor por causa da estatística
      // seria perder a sala para salvar um número.
      .onConflictDoUpdate({
        target: gameResults.roomId,
        set: {
          winnerId: result.winnerId,
          scores: result.scores,
          turns: result.turns,
          durationS: result.durationSeconds,
        },
      });
  }

  async loadResult(roomId: string): Promise<StoredResult | undefined> {
    const [linha] = await this.#db
      .select()
      .from(gameResults)
      .where(eq(gameResults.roomId, roomId))
      .limit(1);

    if (linha === undefined) return undefined;
    return {
      roomId: linha.roomId,
      winnerId: linha.winnerId,
      scores: linha.scores,
      turns: linha.turns,
      durationSeconds: linha.durationS,
    };
  }

  /**
   * Esvazia todas as tabelas. Fora da interface `Store` de propósito: é para o
   * teste começar do zero e para o reset de desenvolvimento, não para o
   * servidor chamar — nada em `src/` referencia isto.
   */
  async limparTudo(): Promise<void> {
    await this.#db.execute(
      sql`TRUNCATE ${gameResults}, ${gameActions}, ${gameSnapshots}, ${roomPlayers}, ${rooms}, ${players} CASCADE`,
    );
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}
