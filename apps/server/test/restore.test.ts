/**
 * O aceite da Fase 2: matar o servidor no meio e subir de novo restaura a
 * partida.
 *
 * O segundo servidor sobe do mesmo banco e do zero em memória — não há estado
 * compartilhado entre os dois além da loja, que é exatamente o que o servidor
 * de produção teria depois de um deploy.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { enumerateLegalActions, type Action } from '@ilhavera/rules';
import type { SnapshotPayload } from '@ilhavera/protocol';

import { MemoryStore } from '../src/persistence/memory.js';
import { PostgresStore } from '../src/persistence/postgres.js';
import { replay } from '../src/persistence/restore.js';
import type { Store } from '../src/persistence/store.js';
import { startTestServer, type Client, type TestServer } from './helpers/server.js';
import type { GameRoom } from '../src/game/room.js';
import type { RoomView } from '../src/rooms/registry.js';

let servidores: TestServer[] = [];

afterEach(async () => {
  for (const s of servidores) await s.close();
  servidores = [];
});

async function subir(store: Store): Promise<TestServer> {
  const s = await startTestServer({ store, registry: { makeSeed: () => 'semente-de-teste' } });
  servidores.push(s);
  return s;
}

function jogoDe(s: TestServer, code: string): GameRoom {
  const room = s.server.rooms.byCode(code);
  if (room?.game === null || room?.game === undefined) throw new Error('sala sem partida');
  return room.game;
}

/** Manda a primeira jogada legal de quem está na vez. */
async function jogarUma(s: TestServer, code: string, clientes: Client[]): Promise<void> {
  const game = jogoDe(s, code);
  const jogador = game.state.players[game.state.currentPlayerIndex];
  if (jogador === undefined) throw new Error('sem jogador da vez');

  const acao = enumerateLegalActions(game.state, jogador.id)[0];
  if (acao === undefined) throw new Error('sem jogada legal');

  const cliente = clientes.find((c) => c.playerId === jogador.id);
  if (cliente === undefined) throw new Error('jogador da vez sem cliente');

  const ack = await cliente.send(...comandoDe(acao));
  if (!ack.ok) throw new Error(`jogada recusada: ${ack.error}`);
}

function comandoDe(
  acao: Action,
): ['game:placeSettlement' | 'game:placeRoad', Record<string, string>] {
  if (acao.type === 'placeSettlement') return ['game:placeSettlement', { vertexId: acao.vertexId }];
  if (acao.type === 'placeRoad') return ['game:placeRoad', { edgeId: acao.edgeId }];
  throw new Error(`o setup não deveria pedir ${acao.type}`);
}

/** Uma partida iniciada, com `quantas` jogadas de setup já feitas. */
async function partidaEmAndamento(
  store: Store,
  quantas: number,
): Promise<{ s: TestServer; code: string; clientes: Client[] }> {
  const s = await subir(store);

  const host = await s.connect();
  const criada = await host.send<RoomView>('room:create', { nickname: 'Ana' });
  if (!criada.ok) throw new Error('falhou ao criar');

  const clientes = [host];
  for (const nome of ['Bruno', 'Carla']) {
    const cliente = await s.connect();
    await cliente.send('room:join', { code: criada.data.code, nickname: nome });
    clientes.push(cliente);
  }
  await host.send('room:start');

  for (let i = 0; i < quantas; i++) await jogarUma(s, criada.data.code, clientes);

  return { s, code: criada.data.code, clientes };
}

describe('replay', () => {
  it('sem ações, devolve o estado de partida', async () => {
    const store = new MemoryStore();
    const { s, code } = await partidaEmAndamento(store, 0);
    const estado = jogoDe(s, code).state;

    const resultado = replay(estado, []);

    expect(resultado.state).toBe(estado);
    expect(resultado.aplicadas).toBe(0);
    expect(resultado.erro).toBeNull();
  });

  it('interrompe e relata quando uma ação não se aplica ao estado gravado', async () => {
    const store = new MemoryStore();
    const { s, code } = await partidaEmAndamento(store, 0);
    const estado = jogoDe(s, code).state;

    const impossivel: Action = {
      type: 'buildCity',
      player: estado.players[0]!.id,
      vertexId: estado.board.vertexOrder[0]!,
    };

    const resultado = replay(estado, [{ seq: 1, action: impossivel }]);

    expect(resultado.aplicadas).toBe(0);
    expect(resultado.erro).toContain('seq 1');
    // Devolve o que conseguiu: melhor alguns lances atrás do que sem partida.
    expect(resultado.state).toBe(estado);
  });
});

describe('restauração: o que dá errado', () => {
  /** Sala marcada como em andamento, mas sem nada de partida gravado. */
  async function salaOrfa(store: MemoryStore): Promise<string> {
    const roomId = '99999999-9999-4999-8999-999999999999';
    const hostId = '88888888-8888-4888-8888-888888888888';

    await store.savePlayer({
      id: hostId,
      nickname: 'Ana',
      secretHash: 'a'.repeat(64),
      createdAt: 1,
    });
    await store.saveRoom({
      id: roomId,
      code: 'ZZZ999',
      hostId,
      status: 'playing',
      settings: { targetVictoryPoints: 10, boardMode: 'balanced' },
      createdAt: 1,
      finishedAt: null,
      seats: [{ playerId: hostId, seatIndex: 0, color: 'red' }],
    });
    return roomId;
  }

  it('sala sem snapshot é registrada e pulada, e o servidor sobe assim mesmo', async () => {
    const store = new MemoryStore();
    const roomId = await salaOrfa(store);

    // O `room:start` gravou a sala e o processo morreu antes do snapshot.
    const s = await subir(store);

    expect(s.server.rooms.byCode('ZZZ999')).toBeUndefined();
    expect(s.server.rooms.size).toBe(0);
    expect(roomId).toBeTruthy();
  });

  it('uma sala quebrada não impede as outras de voltarem', async () => {
    const store = new MemoryStore();
    const { s, code } = await partidaEmAndamento(store, 2);
    await salaOrfa(store);

    await s.close();
    servidores = servidores.filter((x) => x !== s);

    const novo = await subir(store);

    expect(novo.server.rooms.byCode(code)?.game?.version).toBe(2);
    expect(novo.server.rooms.byCode('ZZZ999')).toBeUndefined();
  });

  it('replay que não fecha devolve a partida no ponto até onde deu', async () => {
    const store = new MemoryStore();
    const { s, code } = await partidaEmAndamento(store, 2);
    const roomId = jogoDe(s, code).state.id;

    // Uma ação impossível entra no diário depois das legítimas: é o formato de
    // um banco corrompido, ou de um estado gravado que não é o que dizia ser.
    await store.appendAction({
      roomId,
      seq: 3,
      playerId: 'ninguem',
      action: { type: 'endTurn', player: 'ninguem' },
    });

    await s.close();
    servidores = servidores.filter((x) => x !== s);

    const novo = await subir(store);

    // A sala volta — nas duas jogadas que fecham — em vez de sumir.
    expect(novo.server.rooms.byCode(code)?.game?.version).toBe(2);
  });
});

describe('aceite: o servidor cai no meio da partida', () => {
  it('a partida volta no mesmo ponto, com o mesmo tabuleiro', async () => {
    const store = new MemoryStore();
    const { s, code, clientes } = await partidaEmAndamento(store, 5);

    const antes = jogoDe(s, code).state;
    expect(antes.version).toBe(5);

    // O processo morre. Sobra o banco.
    await s.close();
    servidores = servidores.filter((x) => x !== s);

    const novo = await subir(store);
    const depois = jogoDe(novo, code).state;

    expect(depois.version).toBe(5);
    expect(depois.phase).toBe(antes.phase);
    expect(depois.currentPlayerIndex).toBe(antes.currentPlayerIndex);
    expect(depois.seed).toBe(antes.seed);
    // O tabuleiro inteiro, não só o resumo: é o que o replay determinístico
    // promete reproduzir bit a bit.
    expect(depois.board).toEqual(antes.board);
    expect(depois.buildings).toEqual(antes.buildings);
    expect(depois.roads).toEqual(antes.roads);
    expect(depois.players.map((p) => p.resources)).toEqual(antes.players.map((p) => p.resources));

    expect(clientes).toHaveLength(3);
  });

  it('quem reconecta encontra o assento e recebe o estado', async () => {
    const store = new MemoryStore();
    const { s, code, clientes } = await partidaEmAndamento(store, 3);
    const ana = clientes[0];
    if (ana === undefined) throw new Error('sem Ana');
    const token = ana.token;

    await s.close();
    servidores = servidores.filter((x) => x !== s);

    const novo = await subir(store);
    const devolta = await novo.connect(token ?? undefined);

    // A identidade sobreviveu: não recebeu token novo.
    expect(devolta.token).toBeNull();

    const snapshot = devolta.lastSnapshot as SnapshotPayload | null;
    expect(snapshot?.view.version).toBe(3);
    expect(snapshot?.view.you?.id).toBe(ana.playerId);
    expect(novo.server.rooms.byCode(code)?.seats).toHaveLength(3);
  });

  it('a mesa volta e termina o setup pela rede, do outro lado do reinício', async () => {
    const store = new MemoryStore();
    const { s, code, clientes } = await partidaEmAndamento(store, 4);
    const tokens = clientes.map((c) => c.token);

    await s.close();
    servidores = servidores.filter((x) => x !== s);

    const novo = await subir(store);

    // A mesa inteira reconecta com os tokens que tinha antes da queda.
    const devolta: Client[] = [];
    for (const token of tokens) {
      const cliente = await novo.connect(token ?? undefined);
      expect(cliente.token, 'token não sobreviveu ao reinício').toBeNull();
      devolta.push(cliente);
    }

    // O teste não é "o estado parece certo", é "dá para continuar jogando":
    // faltam 8 das 12 jogadas do setup, todas por WebSocket.
    for (let i = 0; i < 8; i++) await jogarUma(novo, code, devolta);

    const game = jogoDe(novo, code);
    expect(game.state.phase).toBe('awaitingRoll');
    expect(game.version).toBe(12);

    // E o diário continuou de onde parou, sem buraco nem repetição.
    const acoes = await store.loadActionsAfter(game.state.id, 0);
    expect(acoes.map((a) => a.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

/**
 * O mesmo aceite contra o banco de verdade.
 *
 * A `MemoryStore` prova a lógica; só o Postgres prova que o estado sobrevive à
 * ida e volta por JSONB — que é onde um `Map` esquecido ou um `undefined` viram
 * uma partida irrecuperável.
 */
const URL_DO_BANCO = process.env['DATABASE_URL'];

describe.skipIf(URL_DO_BANCO === undefined)('aceite: com Postgres de verdade', () => {
  it('a partida atravessa o reinício passando pelo banco', async () => {
    const store = await PostgresStore.connect({ url: URL_DO_BANCO ?? '' });
    await store.limparTudo();

    try {
      const { s, code, clientes } = await partidaEmAndamento(store, 5);
      const antes = jogoDe(s, code).state;

      await s.close();
      servidores = servidores.filter((x) => x !== s);

      const novo = await subir(store);
      const depois = jogoDe(novo, code).state;

      expect(depois.version).toBe(5);
      expect(depois.board).toEqual(antes.board);
      expect(depois.buildings).toEqual(antes.buildings);
      expect(depois.players.map((p) => p.resources)).toEqual(antes.players.map((p) => p.resources));

      // E continua jogável do outro lado, pela rede.
      const devolta: Client[] = [];
      for (const c of clientes) devolta.push(await novo.connect(c.token ?? undefined));
      await jogarUma(novo, code, devolta);

      expect(jogoDe(novo, code).version).toBe(6);
    } finally {
      await store.close();
    }
  });
});
