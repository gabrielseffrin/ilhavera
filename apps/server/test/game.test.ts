/**
 * Os comandos `game:*` pela rede — do socket até o motor e de volta no ack.
 *
 * As jogadas legais saem de `enumerateLegalActions` sobre o estado do servidor,
 * e não de valores escritos à mão: assim o teste não precisa saber que tabuleiro
 * a semente gerou, e continua valendo se a geração mudar.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { enumerateLegalActions, type Action } from '@ilhavera/rules';

import { startTestServer, type Client, type TestServer } from './helpers/server.js';
import type { GameRoom } from '../src/game/room.js';
import type { RoomView } from '../src/rooms/registry.js';

let atual: TestServer | null = null;

afterEach(async () => {
  await atual?.close();
  atual = null;
});

type Partida = {
  s: TestServer;
  clientes: Client[];
  code: string;
  /** O estado vivo no servidor — a autoridade contra a qual o teste confere. */
  game(): GameRoom;
};

/** Lobby cheio e partida iniciada, no molde do `lobby()` de `rooms.test.ts`. */
async function partida(quantos = 3): Promise<Partida> {
  atual = await startTestServer({ registry: { makeSeed: () => 'semente-de-teste' } });
  const s = atual;

  const nomes = ['Ana', 'Bruno', 'Carla', 'Davi'].slice(0, quantos);
  const host = await s.connect();
  const criada = await host.send<RoomView>('room:create', { nickname: nomes[0] ?? 'Ana' });
  if (!criada.ok) throw new Error('falhou ao criar a sala');

  const clientes: Client[] = [host];
  for (const nome of nomes.slice(1)) {
    const cliente = await s.connect();
    await cliente.send('room:join', { code: criada.data.code, nickname: nome });
    clientes.push(cliente);
  }

  await host.send('room:start');

  return {
    s,
    clientes,
    code: criada.data.code,
    game(): GameRoom {
      const room = s.server.rooms.byCode(criada.data.code);
      if (room?.game === null || room?.game === undefined) throw new Error('partida não iniciada');
      return room.game;
    },
  };
}

/** A primeira jogada legal de quem está na vez, e o cliente dono dela. */
function daVez(p: Partida): { acao: Action; cliente: Client } {
  const game = p.game();
  const jogador = game.state.players[game.state.currentPlayerIndex];
  if (jogador === undefined) throw new Error('partida sem jogador da vez');

  const acao = enumerateLegalActions(game.state, jogador.id)[0];
  if (acao === undefined) throw new Error(`sem jogada legal para ${jogador.id}`);

  const cliente = p.clientes.find((c) => c.playerId === jogador.id);
  if (cliente === undefined) throw new Error('jogador da vez não tem cliente');

  return { acao, cliente };
}

/** Traduz a ação do motor de volta para o comando de rede que a produz. */
function comandoDe(acao: Action): {
  nome: 'game:placeSettlement' | 'game:placeRoad';
  payload: Record<string, unknown>;
} {
  if (acao.type === 'placeSettlement') {
    return { nome: 'game:placeSettlement', payload: { vertexId: acao.vertexId } };
  }
  if (acao.type === 'placeRoad') {
    return { nome: 'game:placeRoad', payload: { edgeId: acao.edgeId } };
  }
  throw new Error(`o setup não deveria pedir ${acao.type}`);
}

describe('game:*: a jogada chega ao motor', () => {
  it('o jogador da vez joga e o ack traz a versão nova', async () => {
    const p = await partida();
    const { acao, cliente } = daVez(p);
    const { nome, payload } = comandoDe(acao);

    const ack = await cliente.send<{ version: number }>(nome, payload);

    expect(ack).toEqual({ ok: true, data: { version: 1 } });
    expect(p.game().version).toBe(1);
  });

  it('quem não é da vez é recusado pelo motor, sem mexer no estado', async () => {
    const p = await partida();
    const { acao, cliente } = daVez(p);
    const { nome, payload } = comandoDe(acao);

    const outro = p.clientes.find((c) => c !== cliente);
    if (outro === undefined) throw new Error('mesa de um jogador só');

    const ack = await outro.send(nome, payload);

    expect(ack).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(p.game().version).toBe(0);
  });

  it('recusa comando de jogo antes do room:start', async () => {
    atual = await startTestServer();
    const cliente = await atual.connect();
    await cliente.send('room:create', { nickname: 'Ana' });

    const ack = await cliente.send('game:rollDice');

    expect(ack).toEqual({ ok: false, error: 'ROOM_NOT_STARTED' });
  });

  it('recusa comando de jogo de quem não está em sala nenhuma', async () => {
    atual = await startTestServer();
    const cliente = await atual.connect();

    const ack = await cliente.send('game:rollDice');

    expect(ack).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  });
});

describe('game:*: a borda de validação', () => {
  it('payload sem o campo obrigatório é BAD_PAYLOAD e não chega ao motor', async () => {
    const p = await partida();
    const { cliente } = daVez(p);

    const ack = await cliente.send('game:placeSettlement', {});

    expect(ack).toEqual({ ok: false, error: 'BAD_PAYLOAD' });
    expect(p.game().version).toBe(0);
  });

  it('comando sem requestId é BAD_PAYLOAD', async () => {
    const p = await partida();
    const { acao, cliente } = daVez(p);
    const { payload } = comandoDe(acao);

    const ack = await new Promise((resolve) => {
      cliente.socket.emit('game:placeSettlement', payload, resolve);
    });

    expect(ack).toEqual({ ok: false, error: 'BAD_PAYLOAD' });
    expect(p.game().version).toBe(0);
  });

  it('carta de progresso com parâmetro do tipo errado é BAD_PAYLOAD', async () => {
    const p = await partida();
    const { cliente } = daVez(p);

    // `monopoly` exige `resource`; sem ele o union discriminado não fecha.
    const ack = await cliente.send('game:playDevCard', { card: 'monopoly' });

    expect(ack).toEqual({ ok: false, error: 'BAD_PAYLOAD' });
  });
});

describe('game:*: idempotência pela rede', () => {
  it('reenvio com o mesmo requestId devolve o ack original e não joga de novo', async () => {
    const p = await partida();
    const { acao, cliente } = daVez(p);
    const { nome, payload } = comandoDe(acao);

    const primeira = await cliente.send<{ version: number }>(nome, payload, 'req-fixo');
    const reenvio = await cliente.send<{ version: number }>(nome, payload, 'req-fixo');

    expect(reenvio).toEqual(primeira);
    expect(p.game().version).toBe(1);
  });
});

describe('game:*: aceite da M3', () => {
  it('três jogadores completam o setup inteiro só por WebSocket', async () => {
    const p = await partida(3);

    // Setup: cada jogador põe dois assentamentos e duas estradas, em duas
    // rodadas — 12 jogadas.
    for (let i = 0; i < 12; i++) {
      const { acao, cliente } = daVez(p);
      const { nome, payload } = comandoDe(acao);

      const ack = await cliente.send<{ version: number }>(nome, payload);
      expect(ack.ok, `jogada ${i + 1} (${nome}) recusada`).toBe(true);
    }

    const game = p.game();
    expect(game.state.phase).toBe('awaitingRoll');
    expect(game.version).toBe(12);

    // Cada um saiu do setup com dois assentamentos, duas estradas e a produção
    // do segundo assentamento na mão.
    for (const jogador of game.state.players) {
      const assentamentos = Object.values(game.state.buildings).filter(
        (b) => b.owner === jogador.id,
      );
      const estradas = Object.values(game.state.roads).filter((r) => r.owner === jogador.id);
      const naMao = Object.values(jogador.resources).reduce((a, b) => a + b, 0);

      expect(assentamentos).toHaveLength(2);
      expect(estradas).toHaveLength(2);
      expect(naMao).toBeGreaterThan(0);
    }
  });
});
