/**
 * O que o servidor grava, e quando.
 *
 * A suíte de contrato prova que a loja funciona; esta prova que alguém a
 * chama — que é o defeito mais fácil de deixar passar, porque um servidor que
 * não grava nada continua verde em todos os outros testes.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { MemoryStore } from '../src/persistence/memory.js';
import { startTestServer, type TestServer } from './helpers/server.js';
import type { RoomView } from '../src/rooms/registry.js';

let atual: TestServer | null = null;

afterEach(async () => {
  await atual?.close();
  atual = null;
});

async function servidor(): Promise<{ s: TestServer; store: MemoryStore }> {
  const store = new MemoryStore();
  atual = await startTestServer({
    store,
    registry: { makeSeed: () => 'semente-de-teste' },
  });
  return { s: atual, store };
}

/**
 * As gravações de identidade e sala são disparadas sem `await` — o handshake
 * não espera o banco. Um respiro basta para elas assentarem.
 */
async function assentar(): Promise<void> {
  await new Promise((r) => setTimeout(r, 30));
}

describe('persistência: identidade', () => {
  it('grava o jogador na emissão do token', async () => {
    const { s, store } = await servidor();
    const cliente = await s.connect();
    await assentar();

    const guardados = await store.loadPlayers();

    expect(guardados).toHaveLength(1);
    expect(guardados[0]?.id).toBe(cliente.playerId);
    expect(guardados[0]?.nickname).toBeNull();
    // O segredo nunca é gravado — só o hash, em hex.
    expect(guardados[0]?.secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cliente.token).not.toContain(guardados[0]?.secretHash);
  });

  it('grava o apelido quando ele chega, no room:create', async () => {
    const { s, store } = await servidor();
    const cliente = await s.connect();
    await cliente.send('room:create', { nickname: 'Ana' });
    await assentar();

    const [guardado] = await store.loadPlayers();
    expect(guardado?.nickname).toBe('Ana');
  });

  it('não grava jogador de novo a cada reconexão', async () => {
    const { s, store } = await servidor();
    const primeiro = await s.connect();
    await assentar();
    primeiro.disconnect();

    await s.connect(primeiro.token ?? undefined);
    await assentar();

    expect(await store.loadPlayers()).toHaveLength(1);
  });
});

describe('persistência: salas', () => {
  it('grava a sala com os assentos no room:create', async () => {
    const { s, store } = await servidor();
    const cliente = await s.connect();
    const ack = await cliente.send<RoomView>('room:create', { nickname: 'Ana' });
    if (!ack.ok) throw new Error('falhou ao criar');
    await assentar();

    const [guardada] = await store.loadRooms('lobby');

    expect(guardada?.code).toBe(ack.data.code);
    expect(guardada?.hostId).toBe(cliente.playerId);
    expect(guardada?.seats).toHaveLength(1);
    expect(guardada?.seats[0]?.seatIndex).toBe(0);
  });

  it('o assento novo aparece no room:join', async () => {
    const { s, store } = await servidor();
    const host = await s.connect();
    const ack = await host.send<RoomView>('room:create', { nickname: 'Ana' });
    if (!ack.ok) throw new Error('falhou ao criar');

    const bruno = await s.connect();
    await bruno.send('room:join', { code: ack.data.code, nickname: 'Bruno' });
    await assentar();

    const [guardada] = await store.loadRooms('lobby');
    expect(guardada?.seats).toHaveLength(2);
    expect(guardada?.seats.map((a) => a.seatIndex)).toEqual([0, 1]);
  });

  it('o status vira playing no room:start', async () => {
    const { s, store } = await servidor();
    const host = await s.connect();
    const ack = await host.send<RoomView>('room:create', { nickname: 'Ana' });
    if (!ack.ok) throw new Error('falhou ao criar');

    for (const nome of ['Bruno', 'Carla']) {
      const cliente = await s.connect();
      await cliente.send('room:join', { code: ack.data.code, nickname: nome });
    }
    await host.send('room:start');
    await assentar();

    expect(await store.loadRooms('lobby')).toHaveLength(0);
    expect(await store.loadRooms('playing')).toHaveLength(1);
  });

  it('lobby que esvaziou sai do banco', async () => {
    const { s, store } = await servidor();
    const cliente = await s.connect();
    await cliente.send('room:create', { nickname: 'Ana' });
    await assentar();
    expect(await store.loadRooms('lobby')).toHaveLength(1);

    await cliente.send('room:leave');
    await assentar();

    expect(await store.loadRooms('lobby')).toHaveLength(0);
  });
});
