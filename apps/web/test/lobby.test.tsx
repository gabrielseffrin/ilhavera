/**
 * O lobby: entrar numa sala e esperar a mesa encher.
 *
 * A tela aqui não sabe regra nenhuma de sala — quem diz se dá para começar é o
 * `canStart` do servidor, quem diz que a cor está tomada é o `COLOR_TAKEN`, e
 * quem diz quem é o anfitrião é o `hostId`. O que se testa é que ela obedece.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { RoomView } from '@ilhavera/protocol';

import { App } from '../src/App.js';
import { criarCliente, type Cliente } from '../src/estado/cliente.js';
import { ProvedorDeCliente } from '../src/estado/contexto.js';
import { conexaoFalsa, type ConexaoFalsa } from './helpers/conexaoFalsa.js';

const EU = 'ana';

function salaCom(jogadores: RoomView['players'], extras: Partial<RoomView> = {}): RoomView {
  return {
    code: 'ABC234',
    hostId: EU,
    status: 'lobby',
    settings: { targetVictoryPoints: 10, boardMode: 'balanced' },
    players: jogadores,
    canStart: jogadores.length >= 3,
    ...extras,
  };
}

const ANA = { id: EU, nickname: 'Ana', color: 'red' as const, connected: true };
const BRUNO = { id: 'bruno', nickname: 'Bruno', color: 'blue' as const, connected: true };
const CARLA = { id: 'carla', nickname: 'Carla', color: 'white' as const, connected: true };

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

  return { cliente, conexao };
}

describe('tela de entrada', () => {
  it('não deixa criar sala sem apelido', async () => {
    montar();
    expect(screen.getByRole('button', { name: 'Criar sala' })).toBeDisabled();

    await userEvent.type(screen.getByTestId('apelido'), 'Ana');
    expect(screen.getByRole('button', { name: 'Criar sala' })).toBeEnabled();
  });

  it('criar sala leva para a sala, com o código à vista', async () => {
    const { conexao } = montar();
    conexao.responder({ ok: true, data: salaCom([ANA]) });

    await userEvent.type(screen.getByTestId('apelido'), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: 'Criar sala' }));

    expect(await screen.findByTestId('codigo-da-sala')).toHaveTextContent('ABC234');
    expect(conexao.enviados[0]?.name).toBe('room:create');
    expect(conexao.enviados[0]?.payload).toEqual({ nickname: 'Ana' });
  });

  it('código inexistente vira recado, e não tela em branco', async () => {
    const { conexao } = montar();
    conexao.responder({ ok: false, error: 'ROOM_NOT_FOUND' });

    await userEvent.type(screen.getByTestId('apelido'), 'Ana');
    await userEvent.type(screen.getByTestId('codigo'), 'ZZZZZZ');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não existe sala com esse código.');
  });

  it('o código digitado em caixa baixa sobe normalizado', async () => {
    const { conexao } = montar();
    conexao.responder({ ok: true, data: salaCom([ANA, BRUNO]) });

    await userEvent.type(screen.getByTestId('apelido'), 'Ana');
    await userEvent.type(screen.getByTestId('codigo'), 'abc234');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(conexao.enviados[0]?.payload).toEqual({ code: 'ABC234', nickname: 'Ana' });
  });
});

describe('tela de sala', () => {
  async function naSala(jogadores: RoomView['players']): Promise<ConexaoFalsa> {
    const { conexao } = montar();
    conexao.responder({ ok: true, data: salaCom(jogadores) });

    await userEvent.type(screen.getByTestId('apelido'), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: 'Criar sala' }));
    await screen.findByTestId('codigo-da-sala');

    conexao.enviados.length = 0;
    return conexao;
  }

  it('o anfitrião só inicia quando o servidor deixa', async () => {
    const conexao = await naSala([ANA, BRUNO]);
    expect(screen.getByRole('button', { name: 'Iniciar partida' })).toBeDisabled();
    expect(screen.getByText('Faltam jogadores para começar.')).toBeInTheDocument();

    conexao.emitir('room:updated', salaCom([ANA, BRUNO, CARLA]));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Iniciar partida' })).toBeEnabled();
    });
  });

  it('quem não é anfitrião não vê o botão de começar', async () => {
    const { conexao } = montar();
    conexao.responder({ ok: true, data: salaCom([BRUNO, ANA], { hostId: 'bruno' }) });

    await userEvent.type(screen.getByTestId('apelido'), 'Ana');
    await userEvent.type(screen.getByTestId('codigo'), 'ABC234');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await screen.findByTestId('codigo-da-sala');
    expect(screen.queryByRole('button', { name: 'Iniciar partida' })).not.toBeInTheDocument();
    expect(screen.getByText('Esperando o anfitrião começar.')).toBeInTheDocument();
  });

  it('mostra quem caiu, sem tirar da lista', async () => {
    const conexao = await naSala([ANA, BRUNO, CARLA]);

    conexao.emitir('room:updated', salaCom([ANA, { ...BRUNO, connected: false }, CARLA]));

    await waitFor(() => {
      expect(
        screen.getByTestId('assentos').querySelector('[data-jogador="bruno"]'),
      ).toHaveAttribute('data-conectado', 'false');
    });
    expect(screen.getByText('Bruno')).toBeInTheDocument();
  });

  it('as cores dos outros não são clicáveis, a minha fica marcada', async () => {
    await naSala([ANA, BRUNO]);

    // `red` é da Ana (eu): marcada e clicável. `blue` é do Bruno: fora.
    expect(screen.getByRole('button', { name: 'red' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'blue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'green' })).toBeEnabled();
  });

  it('escolher cor manda o comando', async () => {
    const conexao = await naSala([ANA, BRUNO]);
    conexao.responder({ ok: true, data: salaCom([{ ...ANA, color: 'green' }, BRUNO]) });

    await userEvent.click(screen.getByRole('button', { name: 'green' }));

    expect(conexao.enviados[0]).toEqual({
      name: 'room:setColor',
      payload: { color: 'green' },
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'green' })).toHaveAttribute('aria-pressed', 'true');
    });
  });
});

describe('estado da conexão', () => {
  it('avisa que caiu, sem tirar a tela do ar', async () => {
    const { conexao } = montar();
    conexao.responder({ ok: true, data: salaCom([ANA, BRUNO, CARLA]) });

    await userEvent.type(screen.getByTestId('apelido'), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: 'Criar sala' }));
    await screen.findByTestId('codigo-da-sala');

    expect(screen.queryByTestId('reconectando')).not.toBeInTheDocument();

    conexao.mudarEstado('reconectando');

    await waitFor(() => {
      expect(screen.getByTestId('reconectando')).toHaveTextContent('Reconectando…');
    });
    // A sala continua na tela: quem caiu quer continuar vendo onde estava.
    expect(screen.getByTestId('codigo-da-sala')).toBeInTheDocument();
  });
});
