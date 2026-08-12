/**
 * A suíte de contrato aplicada a cada implementação de `Store`.
 *
 * O Postgres só entra quando há `DATABASE_URL` — `make test` no container tem;
 * um `pnpm test` no host sem banco continua rodando o resto. O CI define a
 * variável, então o adaptador de produção nunca fica sem cobertura por acidente.
 */

import { describe, it } from 'vitest';

import { MemoryStore } from '../src/persistence/memory.js';
import { PostgresStore } from '../src/persistence/postgres.js';
import { contratoDeStore } from './helpers/store-contract.js';

contratoDeStore('em memória', async () => new MemoryStore());

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
