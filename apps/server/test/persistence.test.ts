/**
 * A suíte de contrato aplicada a cada implementação de `Store`.
 *
 * O Postgres só entra quando há `DATABASE_URL` — `make test` no container tem;
 * um `pnpm test` no host sem banco continua rodando o resto. O CI define a
 * variável, então o adaptador de produção nunca fica sem cobertura por acidente.
 */

import { describe, expect, it } from 'vitest';

import { MemoryStore } from '../src/persistence/memory.js';
import { PostgresStore } from '../src/persistence/postgres.js';
import { NullStore, WriteQueue } from '../src/persistence/store.js';
import { contratoDeStore } from './helpers/store-contract.js';

contratoDeStore('em memória', async () => new MemoryStore());

describe('NullStore', () => {
  it('aceita tudo, não guarda nada e nunca rejeita', async () => {
    const store = new NullStore();
    const jogador = { id: 'a', nickname: null, secretHash: 'x', createdAt: 0 };

    await store.savePlayer(jogador);
    await store.setPlayerNickname('a', 'Ana');
    await store.saveRoom({
      id: 'r',
      code: 'ABC234',
      hostId: 'a',
      status: 'lobby',
      settings: { targetVictoryPoints: 10, boardMode: 'balanced', turnSeconds: null },
      createdAt: 0,
      finishedAt: null,
      seats: [],
    });
    await store.appendAction({
      roomId: 'r',
      seq: 1,
      playerId: 'a',
      action: { type: 'rollDice', player: 'a' },
    });
    await store.deleteRoom('r');
    await store.close();

    // O servidor sobe sem banco e não encontra nada para restaurar — que é
    // exatamente o comportamento esperado de "sem persistência".
    expect(await store.loadPlayers()).toEqual([]);
    expect(await store.loadRooms('playing')).toEqual([]);
    expect(await store.loadLatestSnapshot('r')).toBeUndefined();
    expect(await store.loadActionsAfter('r', 0)).toEqual([]);
  });
});

describe('WriteQueue', () => {
  it('serializa por chave e deixa chaves diferentes em paralelo', async () => {
    const fila = new WriteQueue();
    const ordem: string[] = [];

    const lenta = (rotulo: string, ms: number) => async (): Promise<void> => {
      await new Promise((r) => setTimeout(r, ms));
      ordem.push(rotulo);
    };

    await Promise.all([
      fila.enqueue('sala-1', lenta('1a', 20)),
      fila.enqueue('sala-1', lenta('1b', 1)),
      fila.enqueue('sala-2', lenta('2a', 1)),
    ]);

    // `1b` espera `1a` mesmo sendo mais rápida; `2a` não espera ninguém.
    expect(ordem.indexOf('1a')).toBeLessThan(ordem.indexOf('1b'));
    expect(ordem[0]).toBe('2a');
  });

  it('uma falha não trava a fila da mesma chave', async () => {
    const fila = new WriteQueue();

    const quebrada = fila.enqueue('sala-1', () => Promise.reject(new Error('banco caiu')));
    await expect(quebrada).rejects.toThrow('banco caiu');

    // A próxima gravação daquela sala precisa acontecer assim mesmo, senão uma
    // falha isolada silenciaria a persistência da partida inteira.
    let rodou = false;
    await fila.enqueue('sala-1', async () => {
      rodou = true;
    });
    expect(rodou).toBe(true);

    await fila.settled('sala-1');
    fila.esquecer('sala-1');
  });
});

const URL_DO_BANCO = process.env['DATABASE_URL'];

if (URL_DO_BANCO === undefined) {
  describe('Store: Postgres', () => {
    it.skip('sem DATABASE_URL — suba o banco com `make up` para rodar', () => {});
  });
} else {
  contratoDeStore('Postgres', async () => {
    const store = await PostgresStore.connect({ url: URL_DO_BANCO });
    await store.limparTudo();
    return store;
  });
}
