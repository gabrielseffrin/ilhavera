/**
 * Sair da sala no meio da partida.
 *
 * O caminho nunca tinha sido exercitado: o aceite da Fase 4 derruba uma aba e a
 * traz de volta, que é o oposto disto — lá o objetivo é **não** perder a mesa.
 * Aqui é perdê-la de propósito, e foi onde o defeito morava.
 *
 * `App.tsx` escolhe a tela por `mesa !== null ? Partida : sala !== null ? Sala :
 * Entrada`, e `mesa` vem na frente. Como `sair()` zerava só `sala`, o servidor
 * removia o jogador, o socket saía da sala, e a tela continuava exatamente onde
 * estava — um botão que funciona por inteiro menos na única parte que o jogador
 * vê.
 *
 * O segundo caso é o que fazia a correção ingênua não bastar: zerar a tela sem
 * esquecer a `ClientView` deixaria a mesa velha pendurada no driver, e a próxima
 * sala apareceria já mostrando o tabuleiro da anterior antes do primeiro
 * snapshot chegar.
 */

import { act, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { subirMesa, ate, type Jogador, type MesaEmRede } from './helpers/mesaEmRede.js';

let mesa: MesaEmRede | null = null;

afterEach(async () => {
  await mesa?.fechar();
  mesa = null;
});

async function preencher(jogador: Jogador, campo: string, texto: string): Promise<void> {
  const entrada = within(jogador.tela.container).getByTestId(campo);
  await act(async () => {
    fireEvent.change(entrada, { target: { value: texto } });
    await Promise.resolve();
  });
}

async function clicar(jogador: Jogador, nome: string | RegExp): Promise<void> {
  const botao = within(jogador.tela.container).getByRole('button', { name: nome });
  await act(async () => {
    fireEvent.click(botao);
    await Promise.resolve();
  });
}

function partida(jogador: Jogador): ReturnType<Jogador['cliente']['partida']['getState']> {
  return jogador.cliente.partida.getState();
}

function salaDe(jogador: Jogador): ReturnType<NonNullable<Jogador['cliente']['sala']>['getState']> {
  const store = jogador.cliente.sala;
  if (store === null) throw new Error('cliente de rede sem store de sala');
  return store.getState();
}

/** Duas pessoas até o tabuleiro — o mínimo para a partida existir. */
async function ateOTabuleiro(): Promise<{ atual: MesaEmRede; ana: Jogador }> {
  const atual = await subirMesa('sair');
  mesa = atual;

  const ana = await atual.entrar('Ana');
  await preencher(ana, 'apelido', 'Ana');
  await clicar(ana, 'Criar sala');
  await ate(() => salaDe(ana).sala !== null, 'a sala da Ana');

  const codigo = salaDe(ana).sala?.code;
  if (codigo === undefined) throw new Error('sala criada sem código');

  for (const nome of ['Bruno', 'Carla']) {
    const jogador = await atual.entrar(nome);
    await preencher(jogador, 'apelido', nome);
    await preencher(jogador, 'codigo', codigo);
    await clicar(jogador, 'Entrar');
    await ate(() => salaDe(jogador).sala !== null, `${nome} na sala`);
  }

  await ate(() => salaDe(ana).sala?.canStart === true, 'a mesa completa');
  await clicar(ana, 'Iniciar partida');
  await ate(() => partida(ana).mesa !== null, 'o tabuleiro da Ana');

  return { atual, ana };
}

describe('sair da sala', () => {
  it('sair no meio da partida devolve a tela de entrada', async () => {
    const { ana } = await ateOTabuleiro();

    // A tela é mesmo a da partida antes do clique.
    expect(within(ana.tela.container).queryByTestId('painel-da-mao')).not.toBeNull();

    await clicar(ana, 'Sair da sala');
    await ate(() => salaDe(ana).sala === null, 'a sala esvaziada');

    // O que o jogador vê: a porta de entrada, e nenhum resto de tabuleiro.
    await ate(
      () => within(ana.tela.container).queryByTestId('apelido') !== null,
      'a tela de entrada de volta',
    );
    expect(within(ana.tela.container).queryByTestId('painel-da-mao')).toBeNull();
    expect(partida(ana).mesa).toBeNull();
    // Sobe servidor e três telas de verdade: o prazo é o do aceite, não o padrão.
  }, 60_000);

  /**
   * O assento sobrevive à saída, e é decisão do servidor: `RoomRegistry.leave`
   * só remove de sala em `lobby` (`registry.ts:269`). Numa partida em andamento
   * ele marca o assento como desconectado e mantém o jogador em `#byPlayer` —
   * tirá-lo deixaria uma mesa de três com dois assentos no meio do turno.
   *
   * A consequência é que quem "saiu" continua pertencendo àquela sala, e
   * `room:create` recusaria com `ALREADY_IN_ROOM`. Em vez de esconder isso, a
   * tela de entrada oferece o caminho de volta.
   */
  it('quem sai de uma partida em andamento recebe o caminho de volta', async () => {
    const { ana } = await ateOTabuleiro();
    const codigo = salaDe(ana).sala?.code;

    await clicar(ana, 'Sair da sala');
    await ate(() => partida(ana).mesa === null, 'a mesa esquecida');

    // O assento ficou guardado, e a tela diz isso antes do formulário.
    expect(salaDe(ana).assento).toBe(codigo);
    expect(within(ana.tela.container).queryByTestId('assento-guardado')).not.toBeNull();

    await clicar(ana, 'Voltar para a partida');
    await ate(() => partida(ana).mesa !== null, 'o tabuleiro de volta');

    // Voltou para a mesma sala, com o tabuleiro, e sem assento pendente.
    expect(salaDe(ana).sala?.code).toBe(codigo);
    expect(salaDe(ana).assento).toBeNull();
    expect(salaDe(ana).erro).toBeNull();
    expect(within(ana.tela.container).queryByTestId('painel-da-mao')).not.toBeNull();
  }, 60_000);

  /**
   * Sair de um lobby desfaz o assento de verdade (`registry.ts:275`), então não
   * há nada a retomar — e oferecer "voltar" mandaria a pessoa de volta para a
   * sala da qual ela acabou de sair de propósito.
   */
  it('sair de um lobby não guarda assento', async () => {
    const atual = await subirMesa('sair-lobby');
    mesa = atual;

    const ana = await atual.entrar('Ana');
    await preencher(ana, 'apelido', 'Ana');
    await clicar(ana, 'Criar sala');
    await ate(() => salaDe(ana).sala !== null, 'a sala da Ana');

    await clicar(ana, 'Sair da sala');
    await ate(() => salaDe(ana).sala === null, 'a sala esvaziada');

    expect(salaDe(ana).assento).toBeNull();
    expect(within(ana.tela.container).queryByTestId('assento-guardado')).toBeNull();

    // E a prova de que o assento foi mesmo desfeito: dá para criar outra.
    await clicar(ana, 'Criar sala');
    await ate(() => salaDe(ana).sala !== null, 'a sala nova');
    expect(salaDe(ana).erro).toBeNull();
  }, 60_000);
});
