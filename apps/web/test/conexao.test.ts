/**
 * A conexão contra um servidor que não existe.
 *
 * Este arquivo nasceu de um defeito encontrado jogando, e não testando: `make
 * web` sem `make dev` ao lado deixava a pessoa presa em "Reconectando…" para
 * sempre, e o único sinal concreto era o timeout de ack — dez segundos depois de
 * um clique, dizendo que o servidor "não respondeu".
 *
 * A causa era um ouvinte que faltava: `connect_error` não era tratado, então
 * quem nunca conectava ficava em `'ligando'` enquanto o socket.io tentava em
 * silêncio.
 *
 * **Por que nenhum teste pegou isso.** Todos os que tocam a rede sobem o
 * servidor **antes** do cliente — é o que o aceite da Fase 4 faz. O caminho do
 * servidor ausente não era exercitado por ninguém. Estes casos apontam para uma
 * porta fechada de propósito, que é a única forma de exercitá-lo.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { criarConexao, type Conexao } from '../src/rede/conexao.js';
import { sessaoEmMemoria } from '../src/rede/sessao.js';

/**
 * Porta 1: reservada, nunca escutada, e o recusa é imediato. Melhor que uma
 * porta alta ao acaso, que pode estar em uso na máquina de outra pessoa.
 */
const PORTA_MORTA = 'http://127.0.0.1:1';

let aberta: Conexao | null = null;

afterEach(() => {
  aberta?.fechar();
  aberta = null;
});

/** Espera o estado da conexão virar um dos pedidos. */
async function ate(conexao: Conexao, ...alvos: string[]): Promise<string> {
  const limite = Date.now() + 5000;
  while (!alvos.includes(conexao.estado())) {
    if (Date.now() > limite) {
      throw new Error(`estado ficou em "${conexao.estado()}", esperava ${alvos.join(' ou ')}`);
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  return conexao.estado();
}

describe('servidor fora do ar', () => {
  it('sai de "ligando" em vez de esperar para sempre', async () => {
    aberta = criarConexao({ url: PORTA_MORTA, sessao: sessaoEmMemoria(), reconexao: false });

    expect(aberta.estado()).toBe('ligando');

    // O defeito era exatamente este `await` nunca terminar.
    expect(await ate(aberta, 'inacessivel')).toBe('inacessivel');
  });

  it('avisa quem estiver ouvindo', async () => {
    const vistos: string[] = [];
    aberta = criarConexao({ url: PORTA_MORTA, sessao: sessaoEmMemoria(), reconexao: false });
    aberta.aoMudarEstado((e) => vistos.push(e));

    await ate(aberta, 'inacessivel');

    // Sem isto o store da partida nunca saberia, e a faixa não apareceria.
    expect(vistos).toContain('inacessivel');
  });

  it('recusa o comando na hora, sem os dez segundos do ack', async () => {
    aberta = criarConexao({ url: PORTA_MORTA, sessao: sessaoEmMemoria(), reconexao: false });
    await ate(aberta, 'inacessivel');

    const comecou = Date.now();
    const ack = await aberta.enviar({ name: 'room:create', payload: { nickname: 'Ana' } });

    expect(ack).toEqual({ ok: false, error: 'SEM_CONEXAO' });
    // O prazo do ack é de 10s. Esperá-lo para dizer "não respondeu" é fazer a
    // pessoa aguardar por uma resposta que ninguém foi buscar.
    expect(Date.now() - comecou).toBeLessThan(1000);
  });

  it('quem foi fechado de propósito também responde na hora', async () => {
    aberta = criarConexao({ url: PORTA_MORTA, sessao: sessaoEmMemoria(), reconexao: false });
    aberta.fechar();

    const ack = await aberta.enviar({ name: 'room:leave' });
    expect(ack).toEqual({ ok: false, error: 'SEM_CONEXAO' });
  });

  it('sem token, não inventa identidade nenhuma', async () => {
    aberta = criarConexao({ url: PORTA_MORTA, sessao: sessaoEmMemoria(), reconexao: false });
    await ate(aberta, 'inacessivel');

    // A identidade vem do `session:issued`, que exige servidor. Um `playerId`
    // fabricado aqui viraria um assento fantasma na primeira conexão de verdade.
    expect(aberta.playerId()).toBeNull();
  });
});
