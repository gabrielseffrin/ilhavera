/**
 * O limite de comandos por socket — M7.
 *
 * O balde é testado com relógio injetado, e não com espera de verdade: teste que
 * depende de `setTimeout` para medir tempo é teste que fica intermitente no CI
 * carregado.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { RateLimiter } from '../src/protocol/rate-limit.js';
import { startTestServer, type TestServer } from './helpers/server.js';
import type { RoomView } from '../src/rooms/registry.js';

describe('RateLimiter', () => {
  /** Relógio de mentira, em milissegundos, controlado pelo teste. */
  function relogio(): { agora: () => number; avancar: (ms: number) => void } {
    let t = 1_000_000;
    return {
      agora: () => t,
      avancar: (ms) => {
        t += ms;
      },
    };
  }

  it('começa cheio — quem acabou de conectar não encontra a porta fechada', () => {
    const limiter = new RateLimiter({ capacity: 3, refillPerSecond: 1 });
    expect(limiter.disponiveis).toBe(3);
  });

  it('deixa passar a rajada até a capacidade e barra a seguinte', () => {
    const { agora } = relogio();
    const limiter = new RateLimiter({ capacity: 3, refillPerSecond: 1, now: agora });

    expect(limiter.tentar()).toBe(true);
    expect(limiter.tentar()).toBe(true);
    expect(limiter.tentar()).toBe(true);
    expect(limiter.tentar()).toBe(false);
  });

  it('repõe em ritmo constante', () => {
    const { agora, avancar } = relogio();
    const limiter = new RateLimiter({ capacity: 3, refillPerSecond: 2, now: agora });

    for (let i = 0; i < 3; i++) limiter.tentar();
    expect(limiter.tentar()).toBe(false);

    avancar(500); // meio segundo a 2/s = uma ficha
    expect(limiter.tentar()).toBe(true);
    expect(limiter.tentar()).toBe(false);
  });

  it('não acumula acima da capacidade por ficar parado', () => {
    const { agora, avancar } = relogio();
    const limiter = new RateLimiter({ capacity: 3, refillPerSecond: 10, now: agora });

    for (let i = 0; i < 3; i++) limiter.tentar();
    avancar(60_000); // um minuto parado

    // O teto é o teto: uma hora de silêncio não compra uma rajada de mil.
    expect(limiter.disponiveis).toBe(3);
  });

  it('a taxa média sustentada é a de reposição, não a da rajada', () => {
    const { agora, avancar } = relogio();
    const limiter = new RateLimiter({ capacity: 5, refillPerSecond: 1, now: agora });

    let passaram = 0;
    // Dez segundos batendo na porta a cada 100ms: 100 tentativas.
    for (let i = 0; i < 100; i++) {
      if (limiter.tentar()) passaram += 1;
      avancar(100);
    }

    // 5 da rajada inicial + ~10 repostas em 10s. O resto foi barrado.
    expect(passaram).toBeGreaterThanOrEqual(14);
    expect(passaram).toBeLessThanOrEqual(16);
  });
});

let atual: TestServer | null = null;

afterEach(async () => {
  await atual?.close();
  atual = null;
});

describe('rate limit pela rede', () => {
  it('responde RATE_LIMITED quando o socket atropela', async () => {
    atual = await startTestServer({
      env: { RATE_LIMIT_BURST: '3', RATE_LIMIT_PER_SECOND: '0.001' },
    });
    const cliente = await atual.connect();

    const respostas = [];
    for (let i = 0; i < 5; i++) respostas.push(await cliente.send('state:resync'));

    // As três primeiras chegam ao servidor de verdade (e são recusadas por não
    // estar em sala); da quarta em diante nem chegam.
    expect(respostas.slice(0, 3).every((r) => !r.ok && r.error === 'NOT_IN_ROOM')).toBe(true);
    expect(respostas.slice(3).every((r) => !r.ok && r.error === 'RATE_LIMITED')).toBe(true);
  });

  it('o limite é por socket: um cliente afogado não afeta o outro', async () => {
    atual = await startTestServer({
      env: { RATE_LIMIT_BURST: '2', RATE_LIMIT_PER_SECOND: '0.001' },
    });
    const afobado = await atual.connect();
    const calmo = await atual.connect();

    for (let i = 0; i < 4; i++) await afobado.send('state:resync');
    expect(await afobado.send('state:resync')).toEqual({ ok: false, error: 'RATE_LIMITED' });

    // O vizinho continua com o balde cheio.
    const ack = await calmo.send<RoomView>('room:create', { nickname: 'Ana' });
    expect(ack.ok).toBe(true);
  });

  it('barra antes de validar: quem atropela com lixo ouve sobre o ritmo', async () => {
    atual = await startTestServer({
      env: { RATE_LIMIT_BURST: '1', RATE_LIMIT_PER_SECOND: '0.001' },
    });
    const cliente = await atual.connect();

    // A primeira gasta a única ficha e é recusada pelo payload.
    expect(await cliente.send('room:create', {})).toEqual({ ok: false, error: 'BAD_PAYLOAD' });

    // A segunda nem chega ao zod: o problema dela é o ritmo, não o payload.
    expect(await cliente.send('room:create', {})).toEqual({ ok: false, error: 'RATE_LIMITED' });
  });

  it('reconectar dá balde novo — o limite morre com o socket', async () => {
    atual = await startTestServer({
      env: { RATE_LIMIT_BURST: '2', RATE_LIMIT_PER_SECOND: '0.001' },
    });
    const cliente = await atual.connect();
    for (let i = 0; i < 3; i++) await cliente.send('state:resync');
    expect(await cliente.send('state:resync')).toEqual({ ok: false, error: 'RATE_LIMITED' });

    const token = cliente.token;
    cliente.disconnect();
    const devolta = await atual.connect(token ?? undefined);

    /**
     * É uma escolha, não um descuido: a alternativa — limite por jogador,
     * sobrevivendo à reconexão — puniria quem tem internet ruim, que é
     * exatamente quem mais reconecta. Quem quiser burlar reconectando paga o
     * handshake a cada rajada, e conter isso é trabalho de um limite por IP.
     */
    expect(await devolta.send('state:resync')).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  });

  it('o padrão não atrapalha uma partida de verdade', async () => {
    // Sem `env`: os padrões de produção, não os do teste.
    atual = await startTestServer({
      env: { RATE_LIMIT_BURST: undefined, RATE_LIMIT_PER_SECOND: undefined },
    });

    const host = await atual.connect();
    const criada = await host.send<RoomView>('room:create', { nickname: 'Ana' });
    if (!criada.ok) throw new Error('falhou ao criar');

    for (const nome of ['Bruno', 'Carla']) {
      const cliente = await atual.connect();
      const ack = await cliente.send('room:join', { code: criada.data.code, nickname: nome });
      expect(ack.ok).toBe(true);
    }

    const inicio = await host.send('room:start');
    expect(inicio.ok).toBe(true);
  });
});
