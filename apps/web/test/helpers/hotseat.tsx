/**
 * Uma mesa hot-seat isolada por teste.
 *
 * Depois da Fase 4 os stores não são mais singletons de módulo: cada cliente tem
 * os seus, entregues por contexto. Ganha-se com isso o que o aceite multijogador
 * precisa (várias telas no mesmo documento) e, de brinde, o que estes testes
 * sempre quiseram — nenhum estado atravessando de um caso para o outro.
 */

import { render, type RenderResult } from '@testing-library/react';

import { App } from '../../src/App.js';
import { criarCliente, type Cliente } from '../../src/estado/cliente.js';
import { ProvedorDeCliente } from '../../src/estado/contexto.js';
import type { GameState } from '@ilhavera/rules';
import type { DriverLocal } from '../../src/estado/motorLocal.js';

export type MesaDeTeste = RenderResult & {
  cliente: Cliente;
  /** O estado cru do motor local. Só existe fora da rede, e só o teste lê. */
  jogo: () => GameState;
  partida: Cliente['partida'];
};

export function montarHotSeat(seed: string): MesaDeTeste {
  const cliente = criarCliente({ modo: 'hot-seat', seed });
  const resultado = render(
    <ProvedorDeCliente cliente={cliente}>
      <App />
    </ProvedorDeCliente>,
  );

  return {
    ...resultado,
    cliente,
    partida: cliente.partida,
    jogo: () => driverDe(cliente).estado(),
  };
}

/** O mesmo, sem renderizar nada: para quem só quer o store. */
export function clienteHotSeat(seed: string): Cliente {
  return criarCliente({ modo: 'hot-seat', seed });
}

export function driverDe(cliente: Cliente): DriverLocal {
  if (cliente.driver.modo !== 'hot-seat') throw new Error('este cliente não tem motor local');
  return cliente.driver as DriverLocal;
}
