/**
 * A caixa de conversa.
 *
 * Dois níveis, e o segundo é o que prova alguma coisa: a unidade contra uma
 * conexão de mentira, para exercitar o que a tela faz com o que chega; e uma
 * mesa de verdade, com duas abas e um servidor no mesmo processo, para provar
 * que a mensagem digitada numa aparece na outra.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import type { RoomView } from '@ilhavera/protocol';

import { App } from '../src/App.js';
import { MAX_MENSAGENS } from '../src/estado/chat.js';
import { criarCliente, type Cliente } from '../src/estado/cliente.js';
import { ProvedorDeCliente } from '../src/estado/contexto.js';
import { conexaoFalsa, type ConexaoFalsa } from './helpers/conexaoFalsa.js';
import { ate, subirMesa, type Jogador, type MesaEmRede } from './helpers/mesaEmRede.js';

const EU = 'ana';

const SALA: RoomView = {
  code: 'ABC234',
  hostId: EU,
  status: 'lobby',
  settings: { targetVictoryPoints: 10, boardMode: 'balanced', turnSeconds: null },
  players: [
    { id: EU, nickname: 'Ana', color: 'red', connected: true },
    { id: 'bruno', nickname: 'Bruno', color: 'blue', connected: true },
  ],
  canStart: false,
};

function montar(): { cliente: Cliente; conexao: ConexaoFalsa } {
  const conexao = conexaoFalsa(EU);
  const cliente = criarCliente({
    modo: 'rede',
    conexao,
    lerApelido: () => '',
    gravarApelido: () => undefined,
  });

  render(
    <ProvedorDeCliente cliente={cliente}>
      <App />
    </ProvedorDeCliente>,
  );
  conexao.emitir('room:updated', SALA);

  return { cliente, conexao };
}

function fala(playerId: string, nickname: string, text: string): Record<string, unknown> {
  return { playerId, nickname, text, at: 1_700_000_000_000 };
}

describe('Chat', () => {
  it('aparece no lobby e diz que ainda não há nada', async () => {
    montar();

    await waitFor(() => {
      expect(screen.getByTestId('chat')).toBeInTheDocument();
    });
    expect(screen.getByTestId('chat-mensagens')).toHaveTextContent('Ninguém disse nada ainda');
  });

  it('mostra o que chega pelo evento, na ordem em que chegou', async () => {
    const { conexao } = montar();
    await waitFor(() => screen.getByTestId('chat'));

    conexao.emitir('chat:message', fala('bruno', 'Bruno', 'alguém tem trigo?'));
    conexao.emitir('chat:message', fala(EU, 'Ana', 'eu tenho'));

    await waitFor(() => {
      const linhas = screen.getByTestId('chat-mensagens').querySelectorAll('li');
      expect([...linhas].map((l) => l.textContent)).toEqual([
        'Bruno: alguém tem trigo?',
        'Ana: eu tenho',
      ]);
    });
  });

  it('manda o comando com o texto aparado e limpa o campo', async () => {
    const usuario = userEvent.setup();
    const { conexao } = montar();
    await waitFor(() => screen.getByTestId('chat'));
    conexao.responder({ ok: true, data: undefined });

    const campo = screen.getByTestId('chat-campo');
    await usuario.type(campo, '  tenho madeira  ');
    await usuario.click(screen.getByTestId('chat-enviar'));

    await waitFor(() => {
      expect(conexao.enviados.at(-1)).toEqual({
        name: 'chat:send',
        payload: { text: 'tenho madeira' },
      });
    });
    expect(campo).toHaveValue('');
  });

  it('não manda nada quando o campo tem só espaços', async () => {
    const usuario = userEvent.setup();
    const { conexao } = montar();
    await waitFor(() => screen.getByTestId('chat'));

    await usuario.type(screen.getByTestId('chat-campo'), '   ');

    // O botão nem chega a ficar clicável: mandar espaço em branco para a mesa
    // inteira é ruído que não dá para desfazer.
    expect(screen.getByTestId('chat-enviar')).toBeDisabled();
    expect(conexao.enviados.filter((c) => c.name === 'chat:send')).toHaveLength(0);
  });

  it('**não** ecoa a própria mensagem antes de o servidor devolvê-la', async () => {
    const usuario = userEvent.setup();
    const { conexao } = montar();
    await waitFor(() => screen.getByTestId('chat'));
    conexao.responder({ ok: true, data: undefined });

    await usuario.type(screen.getByTestId('chat-campo'), 'oi');
    await usuario.click(screen.getByTestId('chat-enviar'));

    // O servidor é a autoridade também aqui. Uma linha que aparece e some
    // porque a recusa chegou depois é pior que uma que demora um piscar.
    expect(screen.getByTestId('chat-mensagens')).toHaveTextContent('Ninguém disse nada ainda');

    conexao.emitir('chat:message', fala(EU, 'Ana', 'oi'));
    await waitFor(() => {
      expect(screen.getByTestId('chat-mensagens')).toHaveTextContent('Ana: oi');
    });
  });

  it('mostra a recusa do servidor como alerta', async () => {
    const usuario = userEvent.setup();
    const { conexao } = montar();
    await waitFor(() => screen.getByTestId('chat'));
    conexao.responder({ ok: false, error: 'RATE_LIMITED' });

    await usuario.type(screen.getByTestId('chat-campo'), 'muito rápido');
    await usuario.click(screen.getByTestId('chat-enviar'));

    await waitFor(() => {
      expect(within(screen.getByTestId('chat')).getByRole('alert')).toHaveTextContent('Calma');
    });
  });

  it('segura o histórico num teto em vez de crescer sem fim', async () => {
    const { conexao } = montar();
    await waitFor(() => screen.getByTestId('chat'));

    for (let i = 0; i < MAX_MENSAGENS + 20; i++) {
      conexao.emitir('chat:message', fala('bruno', 'Bruno', `linha ${i}`));
    }

    await waitFor(() => {
      const linhas = screen.getByTestId('chat-mensagens').querySelectorAll('li');
      expect(linhas).toHaveLength(MAX_MENSAGENS);
      // Ficam as mais recentes: é para trás que ninguém rola três horas.
      expect(linhas[linhas.length - 1]).toHaveTextContent(`linha ${MAX_MENSAGENS + 19}`);
    });
  });

  it('não existe no hot-seat — uma pessoa não conversa consigo mesma', () => {
    const cliente = criarCliente({ modo: 'hot-seat', seed: 'chat' });

    render(
      <ProvedorDeCliente cliente={cliente}>
        <App />
      </ProvedorDeCliente>,
    );

    expect(screen.queryByTestId('chat')).not.toBeInTheDocument();
  });
});

describe('Chat: duas abas e um servidor de verdade', () => {
  let mesa: MesaEmRede | null = null;

  afterEach(async () => {
    await mesa?.fechar();
    mesa = null;
  });

  /** Digita num campo da tela daquele jogador — o lobby pela interface. */
  async function preencher(jogador: Jogador, campo: string, texto: string): Promise<void> {
    const entrada = within(jogador.tela.container).getByTestId(campo);
    await act(async () => {
      fireEvent.change(entrada, { target: { value: texto } });
      await Promise.resolve();
    });
  }

  async function clicar(alvo: HTMLElement): Promise<void> {
    await act(async () => {
      fireEvent.click(alvo);
      await Promise.resolve();
    });
  }

  it('o que uma aba digita aparece na outra', async () => {
    mesa = await subirMesa('chat-em-rede');
    const ana = await mesa.entrar('Ana');
    const bruno = await mesa.entrar('Bruno');

    // Lobby pela interface, como o aceite da Fase 4 faz: sem atalho pelo store.
    await preencher(ana, 'apelido', 'Ana');
    await clicar(within(ana.tela.container).getByRole('button', { name: 'Criar sala' }));
    await ate(() => ana.cliente.sala?.getState().sala != null, 'a sala da Ana');

    const codigo = ana.cliente.sala?.getState().sala?.code;
    if (codigo === undefined) throw new Error('sala criada sem código');

    await preencher(bruno, 'apelido', 'Bruno');
    await preencher(bruno, 'codigo', codigo);
    await clicar(within(bruno.tela.container).getByRole('button', { name: 'Entrar' }));
    await ate(() => bruno.cliente.sala?.getState().sala != null, 'Bruno na sala');

    // `userEvent` e não `fireEvent` só aqui: o botão é `type="submit"`, e é o
    // `userEvent` que reproduz a sequência que faz o formulário submeter.
    const usuario = userEvent.setup();
    await preencher(ana, 'chat-campo', 'quem tem minério?');
    await act(async () => {
      await usuario.click(within(ana.tela.container).getByTestId('chat-enviar'));
    });

    await ate(
      () => (bruno.cliente.chat?.getState().mensagens.length ?? 0) > 0,
      'a mensagem chegar em Bruno',
    );

    expect(within(bruno.tela.container).getByTestId('chat-mensagens')).toHaveTextContent(
      'Ana: quem tem minério?',
    );
    // E volta para quem mandou: o servidor é quem confirma, para os dois.
    expect(within(ana.tela.container).getByTestId('chat-mensagens')).toHaveTextContent(
      'Ana: quem tem minério?',
    );
  }, 30_000);
});
