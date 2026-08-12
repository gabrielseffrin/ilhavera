import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // `index.ts` é esquema zod declarativo: a cobertura dele é o teste que
      // usa cada comando, não uma linha executada aqui.
      exclude: ['src/index.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
