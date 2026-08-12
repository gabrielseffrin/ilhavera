/**
 * Reconstrução das partidas em andamento na subida do servidor.
 *
 * O método é o que `docs/schema.sql` descreve e o que o ADR-003 justifica:
 * **último snapshot mais replay das ações posteriores**. Isso só funciona
 * porque o motor é determinístico e a semente do PRNG mora dentro do estado —
 * o mesmo par (estado, ação) leva ao mesmo estado seguinte, aqui e no processo
 * que morreu.
 *
 * Duas decisões de escopo:
 *
 * - **Só salas `playing`.** Lobby é conversa de antes do jogo; ressuscitar um
 *   depois de o servidor reiniciar entregaria uma sala em que ninguém está.
 * - **Sala que não reconstrói é registrada e pulada, não fatal.** Uma partida
 *   corrompida no banco não pode impedir o servidor de subir e as outras de
 *   voltarem. O prejuízo fica contido na sala que já estava perdida.
 */

import { reduce, type GameState } from '@ilhavera/rules';

import { GameRoom } from '../game/room.js';
import type { OnWriteError, Store, StoredRoom, WriteQueue } from './store.js';

export type SalaRestaurada = {
  guardada: StoredRoom;
  game: GameRoom;
};

export type RestoreDeps = {
  store: Store;
  writes: WriteQueue;
  onWriteError: OnWriteError;
  /** Registra o que não deu para reconstruir. */
  onSkip: (roomId: string, motivo: string) => void;
};

/**
 * Aplica em sequência as ações posteriores ao snapshot.
 *
 * Uma ação recusada aqui é sinal sério: o estado gravado não é o estado sobre o
 * qual aquela ação foi aceita da primeira vez. Interrompe o replay e devolve o
 * que conseguiu — melhor uma partida alguns lances atrás do que uma partida
 * cuja história não fecha.
 */
export function replay(
  inicial: GameState,
  acoes: readonly { seq: number; action: Parameters<typeof reduce>[1] }[],
): { state: GameState; aplicadas: number; erro: string | null } {
  let state = inicial;
  let aplicadas = 0;

  for (const { seq, action } of acoes) {
    const resultado = reduce(state, action);
    if (!resultado.ok) {
      return { state, aplicadas, erro: `ação seq ${seq} recusada: ${resultado.error}` };
    }
    state = resultado.state;
    aplicadas += 1;
  }

  return { state, aplicadas, erro: null };
}

export async function restaurarSalas(deps: RestoreDeps): Promise<SalaRestaurada[]> {
  const { store, writes, onWriteError, onSkip } = deps;
  const restauradas: SalaRestaurada[] = [];

  for (const guardada of await store.loadRooms('playing')) {
    const snapshot = await store.loadLatestSnapshot(guardada.id);
    if (snapshot === undefined) {
      // Sala marcada como em andamento sem nenhum snapshot: o `room:start`
      // gravou a sala e morreu antes do snapshot da versão 0.
      onSkip(guardada.id, 'sem snapshot');
      continue;
    }

    const posteriores = await store.loadActionsAfter(guardada.id, snapshot.version);
    const { state, aplicadas, erro } = replay(snapshot.state, posteriores);

    if (erro !== null) {
      onSkip(
        guardada.id,
        `replay interrompido após ${aplicadas} de ${posteriores.length}: ${erro}`,
      );
    }

    restauradas.push({
      guardada,
      game: GameRoom.fromState(state, { store, writes, onWriteError }),
    });
  }

  return restauradas;
}
