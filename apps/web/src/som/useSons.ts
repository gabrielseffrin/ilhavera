/**
 * Liga os eventos da partida aos sons.
 *
 * O gatilho é o **log projetado** que já chega no `state:patch` — nenhum
 * componente precisa saber que existe som, e nenhum ponto de chamada ganhou uma
 * linha de "e toque isto aqui". Sons novos se acrescentam a uma tabela.
 *
 * O log só cresce, e cresce por acréscimo (ver `applyClientViewPatch`), então
 * guardar quantos eventos já foram vistos basta para saber o que é novo. Na
 * primeira renderização não toca nada: quem reconecta no turno quarenta recebe o
 * log inteiro de uma vez, e tocar quarenta turnos de sons seria a pior recepção
 * possível.
 */

import { useEffect, useRef } from 'react';

import type { ClientView, GameEvent, PlayerId } from '@ilhavera/rules';

import { estaMudo, sintetizador } from './som.js';
import type { NomeDeSom } from './sintese.js';

/**
 * O som de cada evento. Os que não estão aqui são silenciosos de propósito:
 * um som por evento faria a mesa virar uma máquina de fliperama, e o que se
 * quer marcar são as coisas que mudam a partida.
 */
const SOM_DO_EVENTO: Partial<Record<GameEvent['type'], NomeDeSom>> = {
  diceRolled: 'dado',
  settlementPlaced: 'construir',
  cityBuilt: 'construir',
  roadPlaced: 'construir',
  devCardBought: 'comprar',
  tradeCompleted: 'troca',
  bankTraded: 'troca',
  stolen: 'roubo',
  gameWon: 'vitoria',
};

export function useSons(mesa: ClientView | null, ativo: PlayerId | null): void {
  const vistos = useRef<number | null>(null);
  const eraMinhaVez = useRef(false);

  useEffect(() => {
    if (mesa === null) return;

    const total = mesa.log.length;
    const anterior = vistos.current;
    vistos.current = total;

    // Primeira leitura: só marca a régua. Ver o cabeçalho.
    if (anterior === null) return;
    if (estaMudo()) return;

    const novos = mesa.log.slice(anterior);
    /**
     * Um som por leva, e não um por evento: uma rolagem de produção emite um
     * `resourcesProduced` por jogador, e três "construir" empilhados viram
     * ruído. O primeiro que tiver som ganha.
     */
    const primeiro = novos.map((e) => SOM_DO_EVENTO[e.type]).find((s) => s !== undefined);
    if (primeiro !== undefined) sintetizador().tocar(primeiro);
  }, [mesa]);

  /**
   * "É a sua vez" é o único som que não vem de evento: ele marca uma transição
   * de estado, e é o mais útil de todos — é o que traz de volta quem foi fazer
   * outra coisa enquanto os três adversários jogavam.
   */
  useEffect(() => {
    const minhaVez = ativo !== null && ativo === mesa?.you?.id;
    const virou = minhaVez && !eraMinhaVez.current;
    eraMinhaVez.current = minhaVez;

    if (virou && !estaMudo() && mesa?.winner === null) sintetizador().tocar('suaVez');
  }, [ativo, mesa]);
}
