/**
 * Esquema Drizzle — a tradução de `docs/schema.sql` (§7 do roadmap) para código.
 *
 * O SQL daquele arquivo foi escrito na Fase 1 e é a referência; se os dois
 * divergirem, quem manda é este arquivo, porque é dele que sai a migração.
 *
 * Uma divergência deliberada: `game_results` de §7 **não** está aqui. Ela guarda
 * estatística de partida encerrada, não faz parte de restaurar uma partida viva,
 * e tabela criada sem quem a escreva é peso morto. Entra quando houver tela de
 * fim de jogo (Fase 5).
 *
 * Sobre os tipos: `state` e `action` são `jsonb` com o tipo do motor colado por
 * `$type`. Isso é uma promessa ao compilador, não uma verificação — o que sai do
 * banco é `unknown` de verdade. Quem lê valida na borda de leitura, e é por isso
 * que a restauração passa o estado pelo motor antes de confiar nele.
 */

import { sql } from 'drizzle-orm';
import {
  char,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import type { Action, GameState } from '@ilhavera/rules';
import type { RoomSettings } from '@ilhavera/protocol';

export const players = pgTable('players', {
  id: uuid('id').primaryKey(),
  nickname: text('nickname'),
  /** SHA-256 do segredo em hex. O segredo em si nunca chega aqui. */
  secretHash: text('secret_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey(),
  code: char('code', { length: 6 }).notNull().unique(),
  hostId: uuid('host_id')
    .notNull()
    .references(() => players.id),
  /** lobby | playing | finished | abandoned */
  status: text('status').notNull(),
  settings: jsonb('settings').$type<RoomSettings>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const roomPlayers = pgTable(
  'room_players',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    seatIndex: smallint('seat_index').notNull(),
    color: text('color').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.playerId] })],
);

/**
 * Estado **completo**, com informação oculta. Nunca vai para o cliente sem
 * passar por `toClientView` — o servidor não tem outro caminho para fora.
 */
export const gameSnapshots = pgTable(
  'game_snapshots',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    state: jsonb('state').$type<GameState>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.version] })],
);

/** Log append-only: é o que permite o replay determinístico. */
export const gameActions = pgTable(
  'game_actions',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    /** A `version` que esta ação produziu. */
    seq: integer('seq').notNull(),
    playerId: uuid('player_id'),
    action: jsonb('action').$type<Action>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    primaryKey({ columns: [t.roomId, t.seq] }),
    // A leitura da restauração é sempre "desta sala, a partir de tal seq".
    index('game_actions_room_seq_idx').on(t.roomId, t.seq),
  ],
);
