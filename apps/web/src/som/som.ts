/**
 * A preferência de som, e o sintetizador que a respeita.
 *
 * **Mudo por padrão.** Um jogo que começa fazendo barulho numa aba que a pessoa
 * abriu no trabalho é um jogo que ela fecha. E há uma razão técnica junto:
 * navegador nenhum deixa tocar áudio antes de um gesto, então "ligado por
 * padrão" seria, na prática, "silencioso até alguém clicar em alguma coisa" — a
 * promessa e o comportamento já nasceriam diferentes.
 *
 * O sintetizador é único por aba, e preguiçoso: criá-lo instancia um
 * `AudioContext`, e nem todo módulo que importa daqui quer isso — os testes,
 * principalmente. Aqui um singleton de módulo é correto, ao contrário dos
 * stores: o áudio é do dispositivo, não do jogador, e quatro telas no mesmo
 * documento devem dividir a mesma saída de som.
 */

import { criarSintetizador, type Sintetizador } from './sintese.js';

export const CHAVE_DO_SOM = 'ilhavera:som';

let instancia: Sintetizador | null = null;

export function sintetizador(): Sintetizador {
  instancia ??= criarSintetizador();
  return instancia;
}

/** `true` — mudo — sempre que a preferência não disser explicitamente o contrário. */
export function estaMudo(): boolean {
  try {
    return globalThis.localStorage.getItem(CHAVE_DO_SOM) !== 'ligado';
  } catch {
    // Sem `localStorage` (aba anônima trancada, iframe), fica mudo. Silêncio é
    // o padrão seguro: o contrário incomoda quem não pediu.
    return true;
  }
}

export function definirMudo(mudo: boolean): void {
  try {
    globalThis.localStorage.setItem(CHAVE_DO_SOM, mudo ? 'mudo' : 'ligado');
  } catch {
    // A escolha não sobrevive à aba. Não é motivo para não valer nesta.
  }
}
