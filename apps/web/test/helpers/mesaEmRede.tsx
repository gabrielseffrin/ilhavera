/**
 * Uma mesa de verdade: servidor no mesmo processo, clientes React contra ele.
 *
 * Nada de socket falso aqui. O que este arquivo monta é o caminho inteiro —
 * `<App/>` → store → `socket.io-client` → Fastify → `GameRoom` → `reduce` — e é
 * essa a diferença entre o aceite da fase e os testes de unidade que o cercam.
 *
 * Cada jogador é um `Cliente` com a própria sessão em memória, a própria
 * conexão e os próprios stores, montado num contêiner próprio do mesmo
 * documento. É por isso que os stores deixaram de ser singletons de módulo: com
 * um só, os quatro jogadores seriam a mesma tela e a mesma identidade.
 */

import { act, render, type RenderResult } from '@testing-library/react';

import { buildServer, loadConfig, type AppServer } from '@ilhavera/server';

import { App } from '../../src/App.js';
import { criarCliente, type Cliente } from '../../src/estado/cliente.js';
import { ProvedorDeCliente } from '../../src/estado/contexto.js';
import { criarConexao } from '../../src/rede/conexao.js';
import { sessaoEmMemoria, type Sessao } from '../../src/rede/sessao.js';

export type Jogador = {
  nome: string;
  cliente: Cliente;
  sessao: Sessao;
  tela: RenderResult;
  /** O `playerId` que o servidor deu a esta identidade. */
  id: () => string | null;
};

export type MesaEmRede = {
  servidor: AppServer;
  url: string;
  jogadores: Jogador[];
  /** Monta mais uma tela — a aba reaberta usa a sessão de alguém que saiu. */
  entrar: (nome: string, sessao?: Sessao) => Promise<Jogador>;
  fechar: () => Promise<void>;
};

export async function subirMesa(semente: string): Promise<MesaEmRede> {
  const config = loadConfig({
    PORT: '0',
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    // O robô joga rápido demais para um balde de tamanho humano.
    RATE_LIMIT_BURST: '100000',
    RATE_LIMIT_PER_SECOND: '100000',
  });

  const servidor = buildServer(config, { registry: { makeSeed: () => semente } });
  const { port } = await servidor.listen();
  const url = `http://127.0.0.1:${port}`;

  const jogadores: Jogador[] = [];

  async function entrar(nome: string, sessao = sessaoEmMemoria()): Promise<Jogador> {
    const conexao = criarConexao({ url, sessao, reconexao: true });
    const cliente = criarCliente({
      modo: 'rede',
      conexao,
      lerApelido: () => '',
      gravarApelido: () => undefined,
    });

    const caixa = document.body.appendChild(document.createElement('div'));
    let tela!: RenderResult;
    await act(async () => {
      tela = render(
        <ProvedorDeCliente cliente={cliente}>
          <App />
        </ProvedorDeCliente>,
        { container: caixa },
      );
      await esperarIdentidade(cliente);
    });

    const jogador: Jogador = {
      nome,
      cliente,
      sessao,
      tela,
      id: () => cliente.conexao?.playerId() ?? null,
    };
    jogadores.push(jogador);
    return jogador;
  }

  return {
    servidor,
    url,
    jogadores,
    entrar,

    async fechar() {
      for (const j of jogadores) {
        j.tela.unmount();
        j.cliente.conexao?.fechar();
      }
      await servidor.close();
    },
  };
}

/**
 * O `session:issued` chega logo depois do `connect`, e quem chega com token não
 * o recebe de novo — nesse caso a identidade já saiu do próprio token.
 */
async function esperarIdentidade(cliente: Cliente): Promise<void> {
  const limite = Date.now() + 3000;
  while (cliente.conexao?.playerId() == null) {
    if (Date.now() > limite) throw new Error('o servidor não deu identidade em 3s');
    await new Promise((r) => setTimeout(r, 5));
  }
}

/**
 * Espera até a condição valer, cutucando o laço de eventos.
 *
 * `waitFor` da testing-library serve para o DOM; aqui muita coisa se resolve
 * fora dele — ack de socket, patch que ainda não chegou. Um laço curto com
 * `act` mantém o React em dia sem esperar por relógio.
 */
export async function ate(
  condicao: () => boolean,
  descricao: string,
  prazoMs = 5000,
): Promise<void> {
  const limite = Date.now() + prazoMs;
  while (!condicao()) {
    if (Date.now() > limite) throw new Error(`tempo esgotado esperando: ${descricao}`);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}
