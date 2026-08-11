import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Property tests com muitas partidas precisam de folga.
    testTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/**/*.test.ts',
        // Módulos só de tipos: não têm código executável, e o v8 reporta 0/0
        // como 0%, o que polui o relatório sem indicar nada de real.
        'src/state.ts',
        'src/actions/types.ts',
        'src/actions/kit.ts',
      ],
      reporter: ['text', 'html'],
      // §8 do roadmap: meta > 90% no motor. Threshold falha o build —
      // não é meta decorativa.
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
