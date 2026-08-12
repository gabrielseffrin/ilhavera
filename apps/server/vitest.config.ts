import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Cada teste que sobe um servidor abre porta e socket de verdade. Rodar em
    // paralelo dentro do mesmo arquivo embaralharia o desligamento.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
