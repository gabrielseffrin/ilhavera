/**
 * De onde os componentes tiram o cliente.
 *
 * Sem provedor, cai no cliente padrão — é o que mantém `<App/>` montável cru,
 * como a suíte da Fase 3 faz. Com provedor, cada árvore tem o seu, que é o que
 * permite várias telas no mesmo documento sem que briguem por um store só.
 *
 * Os hooks têm a mesma forma dos de antes (`usePartida((s) => s.mesa)`), então
 * nenhum componente precisou aprender nada novo.
 */

import { createContext, useContext, type ReactNode } from 'react';

import { clientePadrao, type Cliente } from './cliente.js';
import { useStoreDaInterface, type EstadoDaInterface } from './interface.js';
import { useStoreDaPartida, type EstadoDaPartida } from './partida.js';
import { useStoreDaSala, type EstadoDaSala } from './sala.js';

const ContextoDoCliente = createContext<Cliente | null>(null);

export function ProvedorDeCliente({
  cliente,
  children,
}: {
  cliente: Cliente;
  children: ReactNode;
}): React.JSX.Element {
  return <ContextoDoCliente.Provider value={cliente}>{children}</ContextoDoCliente.Provider>;
}

export function useCliente(): Cliente {
  return useContext(ContextoDoCliente) ?? clientePadrao();
}

export function usePartida<T>(seletor: (s: EstadoDaPartida) => T): T {
  return useStoreDaPartida(useCliente().partida, seletor);
}

export function useInterface<T>(seletor: (s: EstadoDaInterface) => T): T {
  return useStoreDaInterface(useCliente().tela, seletor);
}

/**
 * O store da sala não existe no hot-seat. Um estado inerte responde melhor que
 * um `null` para todo consumidor tratar: no hot-seat simplesmente não há sala, e
 * a tela que perguntaria por ela nem chega a ser renderizada.
 */
export function useSala<T>(seletor: (s: EstadoDaSala) => T): T {
  const cliente = useCliente();
  const store = cliente.sala ?? SALA_INERTE;
  return useStoreDaSala(store, seletor);
}

const SALA_INERTE = {
  getState: () => SEM_SALA,
  getInitialState: () => SEM_SALA,
  setState: () => undefined,
  subscribe: () => () => undefined,
} as unknown as NonNullable<Cliente['sala']>;

const SEM_SALA: EstadoDaSala = {
  sala: null,
  apelido: '',
  erro: null,
  ocupado: false,
  definirApelido: () => undefined,
  criar: () => Promise.resolve(),
  entrar: () => Promise.resolve(),
  escolherCor: () => Promise.resolve(),
  iniciar: () => Promise.resolve(),
  sair: () => Promise.resolve(),
  limparErro: () => undefined,
};
