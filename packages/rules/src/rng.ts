/**
 * PRNG semeado e determinístico — §4.1 do roadmap.
 *
 * Escolha: `splitmix32` em modo **counter-based**. O valor da posição `n` é
 * derivado diretamente de `hash(seed) + (n+1) * 0x9E3779B9`, sem depender do
 * valor anterior. Isso dá O(1) para saltar a qualquer ponto do fluxo, o que é
 * o que torna viável restaurar uma partida a partir de um snapshot com
 * `rngCursor` arbitrário sem re-executar toda a sequência — um PRNG stateful
 * clássico (LCG, mulberry32) exigiria reprocessar tudo desde o começo.
 *
 * Toda função aqui é pura: recebe `(seed, cursor)` e devolve o valor junto com
 * o novo cursor. Quem avança o cursor é o reducer, gravando-o no estado.
 */

/** xmur3: string → uint32. Espalha bem seeds curtas e parecidas ("a", "b"). */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * Memo do hash da seed. Referencialmente transparente (mesma entrada, mesma
 * saída), então não fere a pureza do motor — é só cache.
 */
const seedHashCache = new Map<string, number>();

function cachedHash(seed: string): number {
  const hit = seedHashCache.get(seed);
  if (hit !== undefined) return hit;
  const h = hashSeed(seed);
  // Teto para o cache não crescer sem limite em suítes com milhares de seeds.
  if (seedHashCache.size > 4096) seedHashCache.clear();
  seedHashCache.set(seed, h);
  return h;
}

/** Finalizador do splitmix32 aplicado ao contador. Retorna [0, 1). */
function valueAt(seedHash: number, cursor: number): number {
  let t = (seedHash + Math.imul(cursor + 1, 0x9e3779b9)) | 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  t = t ^ (t >>> 15);
  return (t >>> 0) / 4294967296;
}

export type Draw = { value: number; cursor: number };

/** Um número em [0, 1), consumindo uma posição do cursor. */
export function draw(seed: string, cursor: number): Draw {
  return { value: valueAt(cachedHash(seed), cursor), cursor: cursor + 1 };
}

/** Inteiro em [0, maxExclusive), consumindo uma posição do cursor. */
export function randomInt(seed: string, cursor: number, maxExclusive: number): Draw {
  if (maxExclusive <= 0) throw new Error('randomInt exige maxExclusive > 0');
  const d = draw(seed, cursor);
  return { value: Math.floor(d.value * maxExclusive), cursor: d.cursor };
}

export type DiceRoll = { dice: [number, number]; total: number; cursor: number };

/**
 * 2d6. Os dois dados são sorteios independentes — somar um único sorteio de
 * 2..12 daria distribuição uniforme, que é uma regra completamente diferente.
 */
export function rollDice(seed: string, cursor: number): DiceRoll {
  const a = randomInt(seed, cursor, 6);
  const b = randomInt(seed, a.cursor, 6);
  const dice: [number, number] = [a.value + 1, b.value + 1];
  return { dice, total: dice[0] + dice[1], cursor: b.cursor };
}

/** Fisher-Yates. Consome `items.length - 1` posições do cursor. */
export function shuffle<T>(
  seed: string,
  cursor: number,
  items: readonly T[],
): { items: T[]; cursor: number } {
  const out = [...items];
  let c = cursor;
  for (let i = out.length - 1; i > 0; i--) {
    const d = randomInt(seed, c, i + 1);
    c = d.cursor;
    const j = d.value;
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return { items: out, cursor: c };
}

/** Escolhe um elemento. Consome uma posição do cursor. */
export function pick<T>(
  seed: string,
  cursor: number,
  items: readonly T[],
): { item: T; cursor: number } {
  if (items.length === 0) throw new Error('pick exige uma lista não vazia');
  const d = randomInt(seed, cursor, items.length);
  return { item: items[d.value] as T, cursor: d.cursor };
}
