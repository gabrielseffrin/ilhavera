/**
 * A suíte de contrato aplicada a cada implementação de `Store`.
 *
 * O adaptador de Postgres entra aqui junto com ele; até lá, a de memória já
 * garante que o contrato é coerente.
 */

import { MemoryStore } from '../src/persistence/memory.js';
import { contratoDeStore } from './helpers/store-contract.js';

contratoDeStore('em memória', async () => new MemoryStore());
