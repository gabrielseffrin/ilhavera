import { afterEach, describe, expect, it } from 'vitest';

import { startTestServer, type TestServer } from './helpers/server.js';
import type { RoomView } from '../src/rooms/registry.js';

let atual: TestServer | null = null;

afterEach(async () => {
  await atual?.close();
  atual = null;
});

async function servidor(): Promise<TestServer> {
  atual = await startTestServer({ registry: { makeSeed: () => 'semente-de-teste' } });
  return atual;
}

describe('identidade', () => {
  it('emite token para quem chega sem nenhum', async () => {
    const s = await servidor();
    const cliente = await s.connect();

    expect(cliente.token).toMatch(/^[0-9a-f-]{36}\..+/);
    expect(cliente.playerId).toHaveLength(36);
  });

  it('reconhece o mesmo jogador quando o token volta', async () => {
    const s = await servidor();
    const primeiro = await s.connect();
    const token = primeiro.token;
    expect(token).not.toBeNull();
    primeiro.disconnect();

    const devolta = await s.connect(token ?? undefined);

    // Não reemite: quem já tem identidade não recebe outra.
    expect(devolta.token).toBeNull();
    expect(s.server.players.size).toBe(1);
  });

  it('trata token inválido como visitante novo, sem derrubar a conexão', async () => {
    const s = await servidor();

    const cliente = await s.connect('nao-e-um-token.abcdef');

    expect(cliente.socket.connected).toBe(true);
    expect(cliente.token).not.toBeNull();
  });

  it('não aceita token com o segredo trocado', async () => {
    const s = await servidor();
    const dono = await s.connect();
    const id = dono.playerId ?? '';

    const impostor = await s.connect(`${id}.segredo-errado`);

    expect(impostor.playerId).not.toBe(id);
    expect(s.server.players.size).toBe(2);
  });
});

describe('room:create', () => {
  it('cria a sala e devolve o código com o host dentro', async () => {
    const s = await servidor();
    const host = await s.connect();

    const ack = await host.send<RoomView>('room:create', { nickname: 'Ana' });

    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.data.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(ack.data.status).toBe('lobby');
    expect(ack.data.players).toHaveLength(1);
    expect(ack.data.players[0]).toMatchObject({ nickname: 'Ana', connected: true });
    expect(ack.data.canStart).toBe(false);
  });

  it('aplica os padrões de configuração quando o host não manda nada', async () => {
    const s = await servidor();
    const host = await s.connect();

    const ack = await host.send<RoomView>('room:create', { nickname: 'Ana' });

    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.data.settings).toEqual({
      targetVictoryPoints: 10,
      boardMode: 'balanced',
      // Sem relógio por padrão (Fase 5, M5): partida entre amigos raramente
      // quer cronômetro, e ligá-lo sem pedir apressaria quem só está pensando.
      turnSeconds: null,
    });
  });

  it('recusa apelido vazio na borda, antes de criar qualquer coisa', async () => {
    const s = await servidor();
    const host = await s.connect();

    const ack = await host.send('room:create', { nickname: '   ' });

    expect(ack).toEqual({ ok: false, error: 'BAD_PAYLOAD' });
    expect(s.server.rooms.size).toBe(0);
  });

  it('recusa comando sem requestId', async () => {
    const s = await servidor();
    const host = await s.connect();

    const ack = await new Promise((resolve) => {
      host.socket.emit('room:create', { nickname: 'Ana' }, resolve);
    });

    expect(ack).toEqual({ ok: false, error: 'BAD_PAYLOAD' });
  });

  it('não deixa o mesmo jogador criar duas salas', async () => {
    const s = await servidor();
    const host = await s.connect();
    await host.send('room:create', { nickname: 'Ana' });

    const segunda = await host.send('room:create', { nickname: 'Ana' });

    expect(segunda).toEqual({ ok: false, error: 'ALREADY_IN_ROOM' });
  });
});

describe('room:join', () => {
  async function salaCom(nomes: string[]): Promise<{
    s: TestServer;
    code: string;
    clientes: Awaited<ReturnType<TestServer['connect']>>[];
  }> {
    const s = await servidor();
    const clientes = [];

    const host = await s.connect();
    const ack = await host.send<RoomView>('room:create', { nickname: nomes[0] ?? 'Ana' });
    if (!ack.ok) throw new Error('falhou ao criar sala de apoio');
    clientes.push(host);

    for (const nome of nomes.slice(1)) {
      const cliente = await s.connect();
      await cliente.send('room:join', { code: ack.data.code, nickname: nome });
      clientes.push(cliente);
    }

    return { s, code: ack.data.code, clientes };
  }

  it('entra por código e aparece para quem já estava', async () => {
    const { s, code, clientes } = await salaCom(['Ana']);
    const host = clientes[0];
    if (host === undefined) throw new Error('sem host');

    const atualizacao = host.next<RoomView>('room:updated');
    const bruno = await s.connect();
    const ack = await bruno.send<RoomView>('room:join', { code, nickname: 'Bruno' });

    expect(ack.ok).toBe(true);
    const vista = await atualizacao;
    expect(vista.players.map((p) => p.nickname)).toEqual(['Ana', 'Bruno']);
  });

  it('aceita o código em minúsculas', async () => {
    const { s, code } = await salaCom(['Ana']);
    const bruno = await s.connect();

    const ack = await bruno.send('room:join', { code: code.toLowerCase(), nickname: 'Bruno' });

    expect(ack.ok).toBe(true);
  });

  it('dá uma cor diferente a cada jogador', async () => {
    const { s, code } = await salaCom(['Ana', 'Bruno', 'Carla']);

    const room = s.server.rooms.byCode(code);
    const cores = room?.seats.map((x) => x.color) ?? [];

    expect(cores).toHaveLength(3);
    expect(new Set(cores).size).toBe(3);
  });

  it('recusa código que não existe', async () => {
    const s = await servidor();
    const cliente = await s.connect();

    const ack = await cliente.send('room:join', { code: 'ZZZZZZ', nickname: 'Bruno' });

    expect(ack).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
  });

  it('recusa código com caractere ambíguo antes de procurar a sala', async () => {
    const s = await servidor();
    const cliente = await s.connect();

    const ack = await cliente.send('room:join', { code: 'ABC0IL', nickname: 'Bruno' });

    expect(ack).toEqual({ ok: false, error: 'BAD_PAYLOAD' });
  });

  it('recusa apelido já usado na sala, sem diferenciar maiúsculas', async () => {
    const { s, code } = await salaCom(['Ana']);
    const bruno = await s.connect();

    const ack = await bruno.send('room:join', { code, nickname: 'ana' });

    expect(ack).toEqual({ ok: false, error: 'NICKNAME_TAKEN' });
  });

  it('recusa entrada numa sala cheia', async () => {
    const { s, code } = await salaCom(['Ana', 'Bruno', 'Carla', 'Davi']);
    const quinto = await s.connect();

    const ack = await quinto.send('room:join', { code, nickname: 'Elis' });

    expect(ack).toEqual({ ok: false, error: 'ROOM_FULL' });
  });

  it('reentrar na própria sala é idempotente', async () => {
    const { code, clientes } = await salaCom(['Ana', 'Bruno']);
    const bruno = clientes[1];
    if (bruno === undefined) throw new Error('sem bruno');

    const ack = await bruno.send<RoomView>('room:join', { code, nickname: 'Bruno' });

    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.data.players).toHaveLength(2);
  });
});

/**
 * A cor não é enfeite: é como cada um se reconhece no tabuleiro. O servidor
 * atribui a primeira livre para que a sala nunca fique sem, e o jogador troca se
 * quiser — no lobby, e só no lobby.
 */
describe('room:setColor', () => {
  it('troca a cor e conta para a sala inteira', async () => {
    const s = await servidor();
    const ana = await s.connect();
    const criada = await ana.send<RoomView>('room:create', { nickname: 'Ana' });
    if (!criada.ok) throw new Error('sala não criada');

    const bruno = await s.connect();
    await bruno.send('room:join', { code: criada.data.code, nickname: 'Bruno' });

    const aviso = bruno.next<RoomView>('room:updated');
    const ack = await ana.send<RoomView>('room:setColor', { color: 'green' });

    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.data.players.find((j) => j.id === ana.playerId)?.color).toBe('green');
    expect((await aviso).players.find((j) => j.id === ana.playerId)?.color).toBe('green');
  });

  it('recusa cor que já é de outro jogador', async () => {
    const s = await servidor();
    const ana = await s.connect();
    const criada = await ana.send<RoomView>('room:create', { nickname: 'Ana' });
    if (!criada.ok) throw new Error('sala não criada');

    const bruno = await s.connect();
    const entrou = await bruno.send<RoomView>('room:join', {
      code: criada.data.code,
      nickname: 'Bruno',
    });
    if (!entrou.ok) throw new Error('Bruno não entrou');

    const daAna = entrou.data.players.find((j) => j.id === ana.playerId)?.color;
    if (daAna === undefined) throw new Error('Ana sem cor');

    expect(await bruno.send('room:setColor', { color: daAna })).toEqual({
      ok: false,
      error: 'COLOR_TAKEN',
    });
  });

  it('escolher a própria cor de novo não é erro', async () => {
    const s = await servidor();
    const ana = await s.connect();
    const criada = await ana.send<RoomView>('room:create', { nickname: 'Ana' });
    if (!criada.ok) throw new Error('sala não criada');

    const minha = criada.data.players[0]?.color;
    if (minha === undefined) throw new Error('assento sem cor');

    const ack = await ana.send<RoomView>('room:setColor', { color: minha });
    expect(ack.ok).toBe(true);
  });

  it('recusa depois que a partida começou — a cor já virou peça no tabuleiro', async () => {
    const s = await servidor();
    const ana = await s.connect();
    const criada = await ana.send<RoomView>('room:create', { nickname: 'Ana' });
    if (!criada.ok) throw new Error('sala não criada');

    for (const nome of ['Bruno', 'Carla']) {
      const c = await s.connect();
      await c.send('room:join', { code: criada.data.code, nickname: nome });
    }
    await ana.send('room:start');

    expect(await ana.send('room:setColor', { color: 'green' })).toEqual({
      ok: false,
      error: 'ROOM_ALREADY_STARTED',
    });
  });

  it('recusa quem não está em sala nenhuma, e cor que não existe', async () => {
    const s = await servidor();
    const solto = await s.connect();

    expect(await solto.send('room:setColor', { color: 'red' })).toEqual({
      ok: false,
      error: 'NOT_IN_ROOM',
    });
    expect(await solto.send('room:setColor', { color: 'roxo' })).toEqual({
      ok: false,
      error: 'BAD_PAYLOAD',
    });
  });

  it('a cor escolhida no lobby é a cor no tabuleiro', async () => {
    const s = await servidor();
    const ana = await s.connect();
    const criada = await ana.send<RoomView>('room:create', { nickname: 'Ana' });
    if (!criada.ok) throw new Error('sala não criada');

    for (const nome of ['Bruno', 'Carla']) {
      const c = await s.connect();
      await c.send('room:join', { code: criada.data.code, nickname: nome });
    }

    await ana.send('room:setColor', { color: 'brown' });
    await ana.send('room:start');

    const jogo = s.server.rooms.byCode(criada.data.code)?.game;
    expect(jogo?.state.players.find((j) => j.id === ana.playerId)?.color).toBe('brown');
  });
});

describe('room:start', () => {
  async function lobby(quantos: number): Promise<{
    s: TestServer;
    clientes: Awaited<ReturnType<TestServer['connect']>>[];
  }> {
    const s = await servidor();
    const nomes = ['Ana', 'Bruno', 'Carla', 'Davi'].slice(0, quantos);
    const clientes = [];

    const host = await s.connect();
    const ack = await host.send<RoomView>('room:create', { nickname: nomes[0] ?? 'Ana' });
    if (!ack.ok) throw new Error('falhou ao criar lobby');
    clientes.push(host);

    for (const nome of nomes.slice(1)) {
      const cliente = await s.connect();
      await cliente.send('room:join', { code: ack.data.code, nickname: nome });
      clientes.push(cliente);
    }

    return { s, clientes };
  }

  it('o host inicia e a partida entra em setup', async () => {
    const { s, clientes } = await lobby(3);
    const host = clientes[0];
    if (host === undefined) throw new Error('sem host');

    const ack = await host.send<RoomView>('room:start');

    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.data.status).toBe('playing');

    const room = s.server.rooms.byPlayer(host.playerId ?? '');
    expect(room?.game?.state.phase).toBe('setup1');
    expect(room?.game?.state.players).toHaveLength(3);
  });

  it('a partida nasce da semente injetada, então é reproduzível', async () => {
    const { s, clientes } = await lobby(3);
    const host = clientes[0];
    if (host === undefined) throw new Error('sem host');

    await host.send('room:start');
    const room = s.server.rooms.byPlayer(host.playerId ?? '');

    expect(room?.game?.state.seed).toBe('semente-de-teste');
  });

  it('avisa todo mundo da sala que a partida começou', async () => {
    const { clientes } = await lobby(3);
    const [host, bruno] = clientes;
    if (host === undefined || bruno === undefined) throw new Error('lobby incompleto');

    const aviso = bruno.next<RoomView>('room:updated');
    await host.send('room:start');

    expect((await aviso).status).toBe('playing');
  });

  it('recusa quem não é host', async () => {
    const { clientes } = await lobby(3);
    const bruno = clientes[1];
    if (bruno === undefined) throw new Error('sem bruno');

    const ack = await bruno.send('room:start');

    expect(ack).toEqual({ ok: false, error: 'NOT_HOST' });
  });

  it('recusa começar com menos de três jogadores', async () => {
    const { clientes } = await lobby(2);
    const host = clientes[0];
    if (host === undefined) throw new Error('sem host');

    const ack = await host.send('room:start');

    expect(ack).toEqual({ ok: false, error: 'NOT_ENOUGH_PLAYERS' });
  });

  it('recusa iniciar duas vezes', async () => {
    const { clientes } = await lobby(3);
    const host = clientes[0];
    if (host === undefined) throw new Error('sem host');
    await host.send('room:start');

    const ack = await host.send('room:start');

    expect(ack).toEqual({ ok: false, error: 'ROOM_ALREADY_STARTED' });
  });

  it('recusa entrada depois que a partida começou', async () => {
    const { s, clientes } = await lobby(3);
    const host = clientes[0];
    if (host === undefined) throw new Error('sem host');
    const inicio = await host.send<RoomView>('room:start');
    if (!inicio.ok) throw new Error('não iniciou');

    const tardio = await s.connect();
    const ack = await tardio.send('room:join', { code: inicio.data.code, nickname: 'Elis' });

    expect(ack).toEqual({ ok: false, error: 'ROOM_ALREADY_STARTED' });
  });
});

describe('room:leave e desconexão', () => {
  it('quem sai do lobby some da lista', async () => {
    const s = await servidor();
    const host = await s.connect();
    const criada = await host.send<RoomView>('room:create', { nickname: 'Ana' });
    if (!criada.ok) throw new Error('falhou');

    const bruno = await s.connect();
    await bruno.send('room:join', { code: criada.data.code, nickname: 'Bruno' });

    const aviso = host.next<RoomView>('room:updated');
    await bruno.send('room:leave');

    expect((await aviso).players.map((p) => p.nickname)).toEqual(['Ana']);
  });

  it('o host saindo do lobby promove quem sobrou', async () => {
    const s = await servidor();
    const host = await s.connect();
    const criada = await host.send<RoomView>('room:create', { nickname: 'Ana' });
    if (!criada.ok) throw new Error('falhou');

    const bruno = await s.connect();
    await bruno.send('room:join', { code: criada.data.code, nickname: 'Bruno' });

    const aviso = bruno.next<RoomView>('room:updated');
    await host.send('room:leave');

    expect((await aviso).hostId).toBe(bruno.playerId);
  });

  it('sala vazia deixa de existir', async () => {
    const s = await servidor();
    const host = await s.connect();
    await host.send('room:create', { nickname: 'Ana' });
    expect(s.server.rooms.size).toBe(1);

    await host.send('room:leave');

    expect(s.server.rooms.size).toBe(0);
  });

  it('recusa sair de sala nenhuma', async () => {
    const s = await servidor();
    const cliente = await s.connect();

    const ack = await cliente.send('room:leave');

    expect(ack).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  });

  /**
   * O motor recebeu a lista de jogadores em `createGame` e não sabe remover
   * ninguém no meio. Quem sai de uma partida em andamento está desconectando.
   */
  it('sair de uma partida em andamento marca desconectado, não remove o assento', async () => {
    const s = await servidor();
    const host = await s.connect();
    const criada = await host.send<RoomView>('room:create', { nickname: 'Ana' });
    if (!criada.ok) throw new Error('falhou');

    for (const nome of ['Bruno', 'Carla']) {
      const cliente = await s.connect();
      await cliente.send('room:join', { code: criada.data.code, nickname: nome });
    }
    await host.send('room:start');

    const ack = await host.send('room:leave');

    expect(ack.ok).toBe(true);
    const room = s.server.rooms.byCode(criada.data.code);
    expect(room?.seats).toHaveLength(3);
    expect(room?.seats.find((x) => x.nickname === 'Ana')?.connected).toBe(false);
  });

  it('queda de conexão marca desconectado e a volta reconecta ao assento', async () => {
    const s = await servidor();
    const host = await s.connect();
    const criada = await host.send<RoomView>('room:create', { nickname: 'Ana' });
    if (!criada.ok) throw new Error('falhou');

    const bruno = await s.connect();
    await bruno.send('room:join', { code: criada.data.code, nickname: 'Bruno' });
    const tokenDoBruno = bruno.token;

    const quedaVista = host.next<RoomView>('room:updated');
    bruno.disconnect();
    expect((await quedaVista).players.find((p) => p.nickname === 'Bruno')?.connected).toBe(false);

    const voltaVista = host.next<RoomView>('room:updated');
    await s.connect(tokenDoBruno ?? undefined);

    expect((await voltaVista).players.find((p) => p.nickname === 'Bruno')?.connected).toBe(true);
  });
});
