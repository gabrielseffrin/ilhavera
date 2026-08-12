import { afterEach, describe, expect, it } from 'vitest';

import { buildServer } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { startTestServer, type TestServer } from './helpers/server.js';

let atual: TestServer | null = null;

afterEach(async () => {
  await atual?.close();
  atual = null;
});

describe('raiz', () => {
  it('diz o que o processo é em vez de devolver 404', async () => {
    const server = buildServer(loadConfig({ LOG_LEVEL: 'silent' }));

    const resposta = await server.fastify.inject({ method: 'GET', url: '/' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      service: 'ilhavera',
      endpoints: { health: '/health' },
    });

    await server.close();
  });

  it('ainda devolve 404 em rota que não existe', async () => {
    const server = buildServer(loadConfig({ LOG_LEVEL: 'silent' }));

    const resposta = await server.fastify.inject({ method: 'GET', url: '/nao-existe' });

    expect(resposta.statusCode).toBe(404);

    await server.close();
  });
});

describe('health check', () => {
  it('responde ok sem precisar de porta aberta', async () => {
    const server = buildServer(loadConfig({ LOG_LEVEL: 'silent' }));

    const resposta = await server.fastify.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ status: 'ok', sockets: 0 });

    await server.close();
  });

  it('devolve uptime como inteiro não negativo', async () => {
    const server = buildServer(loadConfig({ LOG_LEVEL: 'silent' }));

    const resposta = await server.fastify.inject({ method: 'GET', url: '/health' });
    const { uptime } = resposta.json<{ uptime: number }>();

    expect(Number.isInteger(uptime)).toBe(true);
    expect(uptime).toBeGreaterThanOrEqual(0);

    await server.close();
  });
});

describe('ciclo de vida', () => {
  it('sobe numa porta efêmera e informa qual foi', async () => {
    atual = await startTestServer();

    const porta = Number(new URL(atual.url).port);
    expect(porta).toBeGreaterThan(0);
  });

  it('aceita conexão de socket e a contabiliza no health', async () => {
    atual = await startTestServer();

    const cliente = await atual.connect();
    expect(cliente.socket.connected).toBe(true);

    const resposta = await atual.server.fastify.inject({ method: 'GET', url: '/health' });
    expect(resposta.json()).toMatchObject({ sockets: 1 });
  });

  it('atende vários clientes ao mesmo tempo', async () => {
    atual = await startTestServer();

    await Promise.all([atual.connect(), atual.connect(), atual.connect()]);

    const resposta = await atual.server.fastify.inject({ method: 'GET', url: '/health' });
    expect(resposta.json()).toMatchObject({ sockets: 3 });
  });

  /**
   * O caso que trava CI: um socket vivo mantém o processo em pé e `close()`
   * nunca resolve. É o motivo do hook `onClose` em `app.ts`.
   */
  it('fecha mesmo com socket aberto', async () => {
    atual = await startTestServer();
    await atual.connect();

    await expect(atual.server.close()).resolves.toBeUndefined();
  });
});

describe('configuração', () => {
  it('aplica os padrões quando o ambiente está vazio', () => {
    const config = loadConfig({});

    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.NODE_ENV).toBe('development');
  });

  it('recusa porta fora da faixa em vez de subir torto', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow(/configuração inválida/);
  });

  it('recusa NODE_ENV desconhecido', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(/configuração inválida/);
  });

  it('ignora variáveis que não são do servidor', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://x', PORT: '4000' });

    expect(config.PORT).toBe(4000);
    expect(config).not.toHaveProperty('DATABASE_URL');
  });
});
