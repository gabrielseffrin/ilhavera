/**
 * Identidade de jogador — §7 do roadmap, tabela `players`.
 *
 * Sem senha e sem login: na primeira conexão o servidor emite um par
 * `id.secret`, o cliente guarda no `localStorage`, e toda reconexão apresenta
 * esse token. É o suficiente para "sou o mesmo que estava jogando", que é a
 * única pergunta que o MVP precisa responder.
 *
 * **Em memória neste marco.** A tabela `players` entra na M5, junto com o resto
 * da persistência; até lá, reiniciar o servidor perde as identidades. O formato
 * do registro já é o da tabela para que a troca seja de implementação, não de
 * contrato.
 */

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

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
};

export class PlayerDirectory {
  readonly #records = new Map<PlayerId, PlayerRecord & { secretHash: Buffer }>();
  readonly #now: () => number;

  constructor(options: PlayerDirectoryOptions = {}) {
    this.#now = options.now ?? Date.now;
  }

  issue(): IssuedIdentity {
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');

    this.#records.set(id, {
      id,
      nickname: null,
      createdAt: this.#now(),
      secretHash: hash(secret),
    });

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
    if (record !== undefined) record.nickname = nickname;
  }

  get size(): number {
    return this.#records.size;
  }
}
