/**
 * Registro de salas — o lobby.
 *
 * O lobby vive aqui e não no motor, por decisão do ADR-003: uma sala esperando
 * jogadores não é uma partida, e modelá-la no `GameState` traria preocupação de
 * rede para dentro do pacote puro. `createGame` só é chamado em `start()`.
 *
 * **Em memória em runtime**, como a identidade: o lobby responde a cada comando
 * e não pode virar consulta ao banco. As tabelas `rooms` e `room_players` de §7
 * são o diário, gravadas a cada mudança de assento ou de status.
 *
 * Erro é valor de retorno, nunca exceção — mesma escolha do `reduce` do motor,
 * pelo mesmo motivo: o servidor precisa responder `ack: { ok: false }` sem
 * derrubar a sala.
 */

import { randomBytes, randomUUID } from 'node:crypto';

import {
  ajustesDoMotor,
  type RoomErrorCode,
  type RoomSettings,
  type RoomStatus,
  type RoomView,
} from '@ilhavera/protocol';
import { MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS, type PlayerColor } from '@ilhavera/rules';

import { GameRoom } from '../game/room.js';
import type { PlayerId } from '../identity/players.js';
import { restaurarSalas } from '../persistence/restore.js';
import {
  gravarEmSegundoPlano,
  NullStore,
  WriteQueue,
  type OnWriteError,
  type Store,
  type StoredRoom,
} from '../persistence/store.js';
import { generateUniqueRoomCode } from './code.js';

// `RoomStatus` e `RoomView` são payload de `room:updated` e moram no contrato.
// Reexportados porque o servidor inteiro os importa daqui desde a Fase 2.
export type { RoomStatus, RoomView } from '@ilhavera/protocol';

export type Seat = {
  playerId: PlayerId;
  nickname: string;
  color: PlayerColor;
  connected: boolean;
};

export type Room = {
  id: string;
  code: string;
  hostId: PlayerId;
  status: RoomStatus;
  seats: Seat[];
  settings: RoomSettings;
  /** `null` enquanto a sala está em lobby. Depois de `start`, o dono do estado vivo. */
  game: GameRoom | null;
  createdAt: number;
  lastActivityAt: number;
  /** Preenchido quando a partida termina. É o que `rooms.finished_at` guarda. */
  finishedAt: number | null;
};

export type RoomResult<T> = { ok: true; value: T } | { ok: false; error: RoomErrorCode };

export function toRoomView(room: Room): RoomView {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    settings: { ...room.settings },
    players: room.seats.map((s) => ({
      id: s.playerId,
      nickname: s.nickname,
      color: s.color,
      connected: s.connected,
    })),
    canStart: room.status === 'lobby' && room.seats.length >= MIN_PLAYERS,
  };
}

export type RoomRegistryOptions = {
  now?: () => number;
  /** Injetável para que o teste force uma partida reproduzível. */
  makeSeed?: () => string;
  store?: Store;
  onWriteError?: OnWriteError;
  /** Compartilhada com os `GameRoom`, para que sala e ação cheguem em ordem. */
  writes?: WriteQueue;
};

export class RoomRegistry {
  readonly #byCode = new Map<string, Room>();
  readonly #byPlayer = new Map<PlayerId, string>();
  readonly #now: () => number;
  readonly #makeSeed: () => string;
  readonly #store: Store;
  readonly #onWriteError: OnWriteError;
  readonly #writes: WriteQueue;

  constructor(options: RoomRegistryOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#makeSeed = options.makeSeed ?? (() => randomBytes(16).toString('hex'));
    this.#store = options.store ?? new NullStore();
    this.#onWriteError = options.onWriteError ?? ((): void => {});
    this.#writes = options.writes ?? new WriteQueue();
  }

  /** O que vai para a tabela — a projeção da sala para o diário. */
  #paraOBanco(room: Room): StoredRoom {
    return {
      id: room.id,
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      settings: { ...room.settings },
      createdAt: room.createdAt,
      finishedAt: room.finishedAt,
      seats: room.seats.map((s, i) => ({
        playerId: s.playerId,
        seatIndex: i,
        color: s.color,
      })),
    };
  }

  #gravar(room: Room): void {
    const guardada = this.#paraOBanco(room);
    gravarEmSegundoPlano(
      this.#writes.enqueue(room.id, () => this.#store.saveRoom(guardada)),
      'saveRoom',
      this.#onWriteError,
    );
  }

  /**
   * Traz de volta as partidas que estavam em andamento.
   *
   * Os apelidos vêm do estado do motor, não da tabela `players`: é o nome com
   * que a pessoa entrou *naquela* partida, e é o que os outros jogadores estão
   * vendo no tabuleiro. Trocar depois em `players` não pode renomear alguém no
   * meio do jogo.
   *
   * Todo mundo volta como desconectado — ninguém está conectado a um processo
   * que acabou de subir. A primeira reconexão corrige, pelo caminho que já
   * existe em `connection.ts`.
   */
  async restore(onSkip: (roomId: string, motivo: string) => void): Promise<number> {
    const restauradas = await restaurarSalas({
      store: this.#store,
      writes: this.#writes,
      onWriteError: this.#onWriteError,
      onSkip,
    });

    for (const { guardada, game } of restauradas) {
      const doMotor = new Map(game.state.players.map((p) => [p.id, p.name]));

      const room: Room = {
        id: guardada.id,
        code: guardada.code,
        hostId: guardada.hostId,
        status: 'playing',
        seats: guardada.seats.map((s) => ({
          playerId: s.playerId,
          nickname: doMotor.get(s.playerId) ?? '',
          color: s.color,
          connected: false,
        })),
        settings: { ...guardada.settings },
        game,
        createdAt: guardada.createdAt,
        lastActivityAt: this.#now(),
        finishedAt: null,
      };

      for (const seat of room.seats) {
        game.setConnected(seat.playerId, false);
        this.#byPlayer.set(seat.playerId, room.code);
      }
      this.#byCode.set(room.code, room);
    }

    return restauradas.length;
  }

  byCode(code: string): Room | undefined {
    return this.#byCode.get(code);
  }

  byPlayer(playerId: PlayerId): Room | undefined {
    const code = this.#byPlayer.get(playerId);
    return code === undefined ? undefined : this.#byCode.get(code);
  }

  get size(): number {
    return this.#byCode.size;
  }

  create(hostId: PlayerId, nickname: string, settings: RoomSettings): RoomResult<Room> {
    if (this.#byPlayer.has(hostId)) return { ok: false, error: 'ALREADY_IN_ROOM' };

    const agora = this.#now();
    const room: Room = {
      id: randomUUID(),
      code: generateUniqueRoomCode((c) => this.#byCode.has(c)),
      hostId,
      status: 'lobby',
      seats: [{ playerId: hostId, nickname, color: firstFreeColor([]), connected: true }],
      settings: { ...settings },
      game: null,
      createdAt: agora,
      lastActivityAt: agora,
      finishedAt: null,
    };

    this.#byCode.set(room.code, room);
    this.#byPlayer.set(hostId, room.code);
    this.#gravar(room);
    return { ok: true, value: room };
  }

  join(code: string, playerId: PlayerId, nickname: string): RoomResult<Room> {
    const room = this.#byCode.get(code);
    if (room === undefined) return { ok: false, error: 'ROOM_NOT_FOUND' };

    // Reentrar na própria sala é idempotente: reconexão é o caso comum, e um
    // erro aqui obrigaria o cliente a distinguir "voltei" de "errei o código".
    const atual = this.#byPlayer.get(playerId);
    if (atual === code) {
      this.#touch(room);
      return { ok: true, value: room };
    }
    if (atual !== undefined) return { ok: false, error: 'ALREADY_IN_ROOM' };

    if (room.status !== 'lobby') return { ok: false, error: 'ROOM_ALREADY_STARTED' };
    if (room.seats.length >= MAX_PLAYERS) return { ok: false, error: 'ROOM_FULL' };
    if (room.seats.some((s) => s.nickname.toLowerCase() === nickname.toLowerCase())) {
      return { ok: false, error: 'NICKNAME_TAKEN' };
    }

    room.seats.push({
      playerId,
      nickname,
      color: firstFreeColor(room.seats.map((s) => s.color)),
      connected: true,
    });
    this.#byPlayer.set(playerId, code);
    this.#touch(room);
    this.#gravar(room);
    return { ok: true, value: room };
  }

  /**
   * Sair da sala. Em lobby o assento some; em partida ele permanece.
   *
   * A diferença não é capricho: o motor recebeu a lista de jogadores em
   * `createGame` e não sabe remover ninguém no meio. Quem "sai" de uma partida
   * em andamento está desconectando, e o assento continua esperando a volta —
   * é o que o ADR-003 dá 24 h para acontecer.
   */
  leave(playerId: PlayerId): RoomResult<{ room: Room; removed: boolean }> {
    const room = this.byPlayer(playerId);
    if (room === undefined) return { ok: false, error: 'NOT_IN_ROOM' };

    if (room.status !== 'lobby') {
      this.#setSeatConnected(room, playerId, false);
      this.#touch(room);
      return { ok: true, value: { room, removed: false } };
    }

    room.seats = room.seats.filter((s) => s.playerId !== playerId);
    this.#byPlayer.delete(playerId);

    if (room.seats.length === 0) {
      this.#byCode.delete(room.code);
      // Lobby que esvaziou não é histórico de nada: sai do banco junto.
      gravarEmSegundoPlano(
        this.#writes.enqueue(room.id, () => this.#store.deleteRoom(room.id)),
        'deleteRoom',
        this.#onWriteError,
      );
      return { ok: true, value: { room, removed: true } };
    }

    // O host saiu e a sala continua: promove quem entrou primeiro, senão
    // ninguém mais consegue iniciar a partida.
    if (room.hostId === playerId) {
      const proximo = room.seats[0];
      if (proximo !== undefined) room.hostId = proximo.playerId;
    }

    this.#touch(room);
    this.#gravar(room);
    return { ok: true, value: { room, removed: true } };
  }

  /**
   * Troca a cor de um assento, no lobby.
   *
   * Só antes de `room:start`, e a razão é do motor, não do servidor: a cor entra
   * em `createGame` e passa a ser como a pessoa aparece no tabuleiro. Trocá-la
   * depois repintaria peças já construídas — as estradas de quem era vermelho
   * viravam azuis sem que ninguém as tivesse movido.
   *
   * Escolher a cor que já é sua é idempotente: dois cliques rápidos no mesmo
   * botão não deviam virar erro.
   */
  setColor(playerId: PlayerId, color: PlayerColor): RoomResult<Room> {
    const room = this.byPlayer(playerId);
    if (room === undefined) return { ok: false, error: 'NOT_IN_ROOM' };
    if (room.status !== 'lobby') return { ok: false, error: 'ROOM_ALREADY_STARTED' };

    const meu = room.seats.find((s) => s.playerId === playerId);
    if (meu === undefined) return { ok: false, error: 'NOT_IN_ROOM' };
    if (meu.color === color) return { ok: true, value: room };

    if (room.seats.some((s) => s.color === color)) {
      return { ok: false, error: 'COLOR_TAKEN' };
    }

    meu.color = color;
    this.#touch(room);
    this.#gravar(room);
    return { ok: true, value: room };
  }

  start(playerId: PlayerId): RoomResult<Room> {
    const room = this.byPlayer(playerId);
    if (room === undefined) return { ok: false, error: 'NOT_IN_ROOM' };
    if (room.hostId !== playerId) return { ok: false, error: 'NOT_HOST' };
    if (room.status !== 'lobby') return { ok: false, error: 'ROOM_ALREADY_STARTED' };
    if (room.seats.length < MIN_PLAYERS) return { ok: false, error: 'NOT_ENOUGH_PLAYERS' };

    room.status = 'playing';
    this.#touch(room);
    // Antes de criar a partida: as ações e o snapshot têm chave estrangeira
    // para a sala, e a fila garante que este `INSERT` assenta primeiro.
    this.#gravar(room);

    room.game = GameRoom.create({
      id: room.id,
      seed: this.#makeSeed(),
      players: room.seats.map((s) => ({ id: s.playerId, name: s.nickname, color: s.color })),
      // Só o que é do motor: `turnSeconds` é ajuste de servidor, e entraria no
      // `state.settings`, no snapshot JSONB e na `ClientView` sem ter o que
      // fazer em nenhum dos três.
      settings: ajustesDoMotor(room.settings),
      store: this.#store,
      writes: this.#writes,
      onWriteError: this.#onWriteError,
      now: this.#now,
    });

    return { ok: true, value: room };
  }

  /**
   * A partida acabou: a sala sai de `playing`.
   *
   * Importa mais do que parece. `restore()` só traz de volta o que está em
   * `playing`, então uma sala que termina e não muda de status volta viva no
   * próximo reinício do servidor — com o vencedor já decidido e ninguém para
   * jogar. É a diferença entre um histórico e um fantasma.
   *
   * Idempotente: a jogada da vitória pode ser reaplicada num replay, e o
   * segundo encerramento não pode mexer no `finishedAt` que já foi gravado.
   */
  finish(room: Room): void {
    if (room.status === 'finished') return;

    room.status = 'finished';
    room.finishedAt = this.#now();
    this.#touch(room);
    this.#gravar(room);
  }

  setConnected(playerId: PlayerId, connected: boolean): Room | undefined {
    const room = this.byPlayer(playerId);
    if (room === undefined) return undefined;

    this.#setSeatConnected(room, playerId, connected);
    if (connected) this.#touch(room);
    return room;
  }

  /**
   * O assento e o jogador do motor precisam contar a mesma história: o lobby lê
   * o assento, a partida lê `PlayerState.connected`. Deixar os dois divergirem
   * daria um jogador "online" na lista e "offline" no tabuleiro.
   */
  #setSeatConnected(room: Room, playerId: PlayerId, connected: boolean): void {
    const seat = room.seats.find((s) => s.playerId === playerId);
    if (seat !== undefined) seat.connected = connected;
    room.game?.setConnected(playerId, connected);
  }

  #touch(room: Room): void {
    room.lastActivityAt = this.#now();
  }
}

function firstFreeColor(usadas: readonly PlayerColor[]): PlayerColor {
  const livre = PLAYER_COLORS.find((c) => !usadas.includes(c));
  if (livre === undefined) {
    // Inalcançável: são 6 cores para no máximo 4 assentos. Se acontecer, é bug.
    throw new Error('acabaram as cores de jogador');
  }
  return livre;
}
