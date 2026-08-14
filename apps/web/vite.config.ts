/**
 * `defineConfig` vem do vitest, e não do vite, porque é ele que conhece a chave
 * `test`. Por isso a versão do Vite aqui é a mesma que o vitest carrega: com
 * duas versões na árvore, os tipos de plugin de uma não satisfazem a outra e o
 * `tsc` recusa uma configuração que funciona perfeitamente em runtime.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // O container publica a porta; sem isto o Vite só escuta em localhost de
    // dentro dele e o navegador do host não alcança.
    host: '0.0.0.0',
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    server: {
      deps: {
        /**
         * O aceite da Fase 4 sobe um servidor de verdade no mesmo processo.
         * Sem isto o vitest *inlina* os pacotes do workspace — eles não estão
         * sob `node_modules/` de fato — e transforma o grafo do Fastify para o
         * ambiente jsdom, onde `node:crypto` vira "externalized for browser
         * compatibility" e o servidor morre por um motivo que nada tem a ver
         * com o jogo.
         */
        external: ['@ilhavera/server'],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/main.tsx'],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
