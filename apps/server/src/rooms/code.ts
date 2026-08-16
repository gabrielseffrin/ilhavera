/**
 * Código de sala: 6 caracteres, o que o amigo digita para entrar.
 *
 * O alfabeto exclui `0/O` e `1/I/L` porque o código passa por voz e por
 * captura de tela. Sobram 31 símbolos → 31^6 ≈ 887 milhões de combinações, que
 * é folga suficiente para o registro nunca precisar de mais que um punhado de
 * tentativas para achar um código livre.
 */

import { randomInt } from 'node:crypto';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(): string {
  let codigo = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    codigo += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return codigo;
}

/**
 * Sorteia até achar um código que `emUso` não reconheça.
 *
 * O limite existe para transformar um improvável esgotamento do espaço num erro
 * alto e claro, em vez de num laço infinito que trava o processo.
 */
export function generateUniqueRoomCode(
  emUso: (codigo: string) => boolean,
  tentativas = 100,
): string {
  for (let i = 0; i < tentativas; i++) {
    const codigo = generateRoomCode();
    if (!emUso(codigo)) return codigo;
  }
  throw new Error(`não foi possível sortear código de sala livre em ${tentativas} tentativas`);
}
