/**
 * Identidade de jogador — §7 do roadmap, tabela `players`.
 *
 * Sem senha e sem login: na primeira conexão o servidor emite um par
 * `id.secret`, o cliente guarda no `localStorage`, e toda reconexão apresenta
 * esse token. É o suficiente para "sou o mesmo que estava jogando", que é a
 * única pergunta que o MVP precisa responder.
 *
 * **O diretório em memória continua sendo a fonte de verdade em runtime**: a
 * verificação de token é feita a cada handshake e não pode virar ida ao banco.
 * A tabela `players` é o diário — gravada a cada emissão e carregada na subida,
 * para que reiniciar o servidor não expulse quem já estava jogando.
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import {
  gravarEmSegundoPlano,
  NullStore,
  type OnWriteError,
  type Store,
} from '../persistence/store.js';

export type PlayerId = string;

/** O que o cliente guarda. Opaco de propósito: o formato é assunto do servidor. */
export type PlayerToken = string;

export type PlayerRecord = {
  id: PlayerId;
  nickname: string | null;
  createdAt: number;
};

export type IssuedIdentity = {
  id: PlayerId;
  token: PlayerToken;
};

/**
 * SHA-256 puro, sem bcrypt/argon2 de propósito: o segredo tem 32 bytes de
 * entropia gerados aqui, não é uma senha escolhida por gente. O custo de
 * derivação existe para tornar caro o ataque de dicionário, e não há dicionário
 * que alcance 2^256. O dia em que isto virar senha de verdade, muda.
 */
function hash(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export type PlayerDirectoryOptions = {
  now?: () => number;
  store?: Store;
  onWriteError?: OnWriteError;
};

export class PlayerDirectory {
  readonly #records = new Map<PlayerId, PlayerRecord & { secretHash: Buffer }>();
  readonly #now: () => number;
  readonly #store: Store;
  readonly #onWriteError: OnWriteError;

  constructor(options: PlayerDirectoryOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#store = options.store ?? new NullStore();
    this.#onWriteError = options.onWriteError ?? ((): void => {});
  }

  /** Traz de volta as identidades emitidas antes do reinício. */
  async restore(): Promise<void> {
    for (const guardado of await this.#store.loadPlayers()) {
      this.#records.set(guardado.id, {
        id: guardado.id,
        nickname: guardado.nickname,
        createdAt: guardado.createdAt,
        secretHash: Buffer.from(guardado.secretHash, 'hex'),
      });
    }
  }

  /**
   * A gravação é assíncrona e o token é devolvido na hora, de propósito: o
   * handshake não pode esperar o banco. Se o processo morrer entre uma coisa e
   * outra, o cliente fica com um token que o servidor não reconhece — e o
   * caminho de token inválido já existe e trata isso como visitante novo.
   */
  issue(): IssuedIdentity {
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const secretHash = hash(secret);

    this.#records.set(id, {
      id,
      nickname: null,
      createdAt: this.#now(),
      secretHash,
    });

    gravarEmSegundoPlano(
      this.#store.savePlayer({
        id,
        nickname: null,
        secretHash: secretHash.toString('hex'),
        createdAt: this.#now(),
      }),
      'savePlayer',
      this.#onWriteError,
    );

    return { id, token: `${id}.${secret}` };
  }

  /** Devolve o `PlayerId` se o token confere, `null` em qualquer outro caso. */
  verify(token: unknown): PlayerId | null {
    if (typeof token !== 'string') return null;

    const separador = token.indexOf('.');
    if (separador <= 0) return null;

    const id = token.slice(0, separador);
    const secret = token.slice(separador + 1);
    if (secret.length === 0) return null;

    const record = this.#records.get(id);
    if (record === undefined) return null;

    const candidato = hash(secret);
    // Os dois lados têm 32 bytes fixos, então o comprimento nunca vaza nada e
    // `timingSafeEqual` não corre risco de estourar.
    return timingSafeEqual(candidato, record.secretHash) ? id : null;
  }

  get(id: PlayerId): PlayerRecord | undefined {
    const record = this.#records.get(id);
    if (record === undefined) return undefined;

    const { secretHash: _ignorado, ...publico } = record;
    return publico;
  }

  /** O apelido chega junto de `room:create`/`room:join`, não no handshake. */
  setNickname(id: PlayerId, nickname: string): void {
    const record = this.#records.get(id);
    if (record === undefined) return;

    record.nickname = nickname;
    gravarEmSegundoPlano(
      this.#store.setPlayerNickname(id, nickname),
      'setPlayerNickname',
      this.#onWriteError,
    );
  }

  get size(): number {
    return this.#records.size;
  }
}
