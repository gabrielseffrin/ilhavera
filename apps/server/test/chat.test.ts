/**
 * O chat da sala.
 *
 * Duas coisas são vigiadas aqui, e a segunda é a que importa: que a mensagem
 * chega a **todos os da sala**, e que ela não sai da sala. Um broadcast por
 * código de sala é a coisa certa para chat e a coisa errada para todo o resto do
 * servidor (ver o cabeçalho de `protocol/game.ts`), então vale provar que este
 * caso está do lado certo da linha.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { startTestServer, type Client, type TestServer } from './helpers/server.js';
import type { RoomView } from '../src/rooms/registry.js';

let atual: TestServer | null = null;

afterEach(async () => {
  await atual?.close();
  atual = null;
});

type Mensagem = { playerId: string; nickname: string; text: string; at: number };

/** Uma sala em lobby com os apelidos pedidos, o primeiro sendo o host. */
async function salaCom(...apelidos: string[]): Promise<{ code: string; clientes: Client[] }> {
  atual = await startTestServer();
  const s = atual;

  const [primeiro, ...resto] = apelidos;
  const host = await s.connect();
  const criada = await host.send<RoomView>('room:create', { nickname: primeiro });
  if (!criada.ok) throw new Error('falhou ao criar a sala');

  const clientes = [host];
  for (const nome of resto) {
    const cliente = await s.connect();
    await cliente.send('room:join', { code: criada.data.code, nickname: nome });
    clientes.push(cliente);
  }

  return { code: criada.data.code, clientes };
}

describe('chat:send', () => {
  it('a mensagem chega a todos da sala, inclusive a quem a enviou', async () => {
    const { clientes } = await salaCom('Ana', 'Bruno', 'Carla');
    const [ana] = clientes;

    const recebidas = clientes.map((c) => c.next<Mensagem>('chat:message'));
    const ack = await ana!.send('chat:send', { text: 'alguém tem trigo?' });

    expect(ack).toEqual({ ok: true, data: undefined });
    for (const recebida of await Promise.all(recebidas)) {
      expect(recebida.text).toBe('alguém tem trigo?');
      expect(recebida.nickname).toBe('Ana');
      expect(recebida.playerId).toBe(ana!.playerId);
    }
  });

  it('não vaza para quem está em outra sala', async () => {
    const { clientes } = await salaCom('Ana', 'Bruno');
    const s = atual;
    if (s === null) throw new Error('sem servidor');

    // Uma segunda sala, no mesmo servidor.
    const forasteiro = await s.connect();
    await forasteiro.send('room:create', { nickname: 'Davi' });

    let ouviu = 0;
    forasteiro.socket.on('chat:message', () => {
      ouviu += 1;
    });

    await clientes[0]!.send('chat:send', { text: 'segredo da mesa' });
    await new Promise((r) => setTimeout(r, 50));

    expect(ouviu).toBe(0);
  });

  it('quem não está em sala nenhuma não fala', async () => {
    atual = await startTestServer();
    const sozinho = await atual.connect();

    expect(await sozinho.send('chat:send', { text: 'oi?' })).toEqual({
      ok: false,
      error: 'NOT_IN_ROOM',
    });
  });

  it('recusa mensagem vazia ou só de espaços', async () => {
    const { clientes } = await salaCom('Ana', 'Bruno');

    for (const texto of ['', '   ', '\n\t ']) {
      expect(await clientes[0]!.send('chat:send', { text: texto })).toEqual({
        ok: false,
        error: 'BAD_PAYLOAD',
      });
    }
  });

  it('apara o texto antes de mandar', async () => {
    const { clientes } = await salaCom('Ana', 'Bruno');

    const recebida = clientes[1]!.next<Mensagem>('chat:message');
    await clientes[0]!.send('chat:send', { text: '  com folga  ' });

    expect((await recebida).text).toBe('com folga');
  });

  it('recusa mensagem longa demais em vez de cortar', async () => {
    const { clientes } = await salaCom('Ana', 'Bruno');

    // Cortar em silêncio entregaria metade de uma frase como se fosse a frase.
    expect(await clientes[0]!.send('chat:send', { text: 'x'.repeat(501) })).toEqual({
      ok: false,
      error: 'BAD_PAYLOAD',
    });
    expect(await clientes[0]!.send('chat:send', { text: 'x'.repeat(500) })).toEqual({
      ok: true,
      data: undefined,
    });
  });

  it('continua funcionando depois de a partida começar', async () => {
    const { clientes } = await salaCom('Ana', 'Bruno', 'Carla');
    await clientes[0]!.send('room:start');

    const recebida = clientes[2]!.next<Mensagem>('chat:message');
    const ack = await clientes[1]!.send('chat:send', { text: 'boa jogada' });

    expect(ack.ok).toBe(true);
    expect((await recebida).nickname).toBe('Bruno');
  });
});
