/**
 * Um jogador, com tudo o que é dele.
 *
 * "Cliente" aqui não é "aba": é uma identidade com a própria conexão, o próprio
 * token e os próprios stores. O aplicativo tem exatamente um. O aceite da Fase 4
 * tem vários, no mesmo documento, e é essa a razão de nada disto ser singleton
 * de módulo — quatro jogadores dividindo um `localStorage` seriam a mesma
 * pessoa, e dividindo um store seriam a mesma tela.
 *
 * A conexão é criada **aqui**, e nunca dentro de um `useEffect`: o `StrictMode`
 * monta duas vezes em desenvolvimento, e o efeito abriria dois sockets.
 */

import { criarConexao, type Conexao } from '../rede/conexao.js';
import { sessaoDoNavegador, type Sessao } from '../rede/sessao.js';
import { criarStoreDoChat, type StoreDoChat } from './chat.js';
import { criarDriverDeRede } from './driverDeRede.js';
import { criarMotorLocal } from './motorLocal.js';
import { criarStoreDaInterface, type StoreDaInterface } from './interface.js';
import { criarStoreDaPartida, type StoreDaPartida } from './partida.js';
import { criarStoreDaSala, type StoreDaSala } from './sala.js';
import type { Driver, Modo } from './driver.js';

export type Cliente = {
  modo: Modo;
  /** A fonte da verdade desta tela: o motor local ou o socket. */
  driver: Driver;
  /** `null` no hot-seat: não há socket nenhum aberto. */
  conexao: Conexao | null;
  partida: StoreDaPartida;
  /** `null` no hot-seat: não há sala. */
  sala: StoreDaSala | null;
  /** `null` no hot-seat: uma pessoa não conversa consigo mesma. */
  chat: StoreDoChat | null;
  tela: StoreDaInterface;
};

export type OpcoesDoCliente = {
  modo: Modo;
  url?: string;
  sessao?: Sessao;
  reconexao?: boolean;
  /** Injetável para o teste: sem isto, N clientes dividiriam o mesmo apelido. */
  lerApelido?: () => string;
  gravarApelido?: (apelido: string) => void;
  /** Semente do hot-seat, para o teste fixar a partida. */
  seed?: string;
  /**
   * Uma conexão já pronta, em vez de abrir uma. É a costura por onde o teste
   * entra: dispensa servidor para exercitar o que o cliente faz com o que chega.
   */
  conexao?: Conexao;
};

export function criarCliente(opcoes: OpcoesDoCliente): Cliente {
  if (opcoes.modo === 'hot-seat') {
    const motor = criarMotorLocal(opcoes.seed);
    return {
      modo: 'hot-seat',
      driver: motor,
      conexao: null,
      partida: criarStoreDaPartida(motor),
      sala: null,
      chat: null,
      tela: criarStoreDaInterface(),
    };
  }

  const conexao =
    opcoes.conexao ??
    criarConexao({
      url: opcoes.url ?? urlDoServidor(),
      sessao: opcoes.sessao ?? sessaoDoNavegador(),
      ...(opcoes.reconexao === undefined ? {} : { reconexao: opcoes.reconexao }),
    });

  const driver = criarDriverDeRede(conexao);

  return {
    modo: 'rede',
    driver,
    conexao,
    partida: criarStoreDaPartida(driver),
    sala: criarStoreDaSala({
      conexao,
      ...(opcoes.lerApelido === undefined ? {} : { lerApelido: opcoes.lerApelido }),
      ...(opcoes.gravarApelido === undefined ? {} : { gravarApelido: opcoes.gravarApelido }),
    }),
    chat: criarStoreDoChat(conexao),
    tela: criarStoreDaInterface(),
  };
}

/**
 * O modo vem do ambiente, com hot-seat como padrão.
 *
 * Padrão hot-seat porque é o modo que funciona sem nada rodando ao lado: `pnpm
 * dev` sozinho abre um jogo jogável, e a suíte da Fase 3 continua montando
 * `<App/>` sem servidor. Quem quer rede liga `VITE_MODO=rede`.
 */
export function modoDoAmbiente(): Modo {
  return import.meta.env['VITE_MODO'] === 'rede' ? 'rede' : 'hot-seat';
}

export function urlDoServidor(): string {
  const configurada: unknown = import.meta.env['VITE_SERVIDOR_URL'];
  if (typeof configurada === 'string' && configurada.length > 0) return configurada;
  return 'http://localhost:3000';
}

/**
 * O cliente do navegador. Preguiçoso porque criá-lo abre um socket, e nem todo
 * módulo que importa daqui quer isso — os testes, principalmente.
 */
let padrao: Cliente | null = null;

export function clientePadrao(): Cliente {
  padrao ??= criarCliente({ modo: modoDoAmbiente() });
  return padrao;
}
