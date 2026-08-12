import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Cada teste que sobe um servidor abre porta e socket de verdade. Rodar em
    // paralelo dentro do mesmo arquivo embaralharia o desligamento.
    fileParallelism: false,
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // `main.ts` é só o entrypoint que amarra config, servidor e sinais do
        // processo — quem o exercita é `docker compose up`, não o vitest.
        'src/main.ts',
        // Módulo só de tipos: o v8 reporta 0/0 como 0% e polui o relatório.
        'src/protocol/types.ts',
      ],
      reporter: ['text', 'html'],
      // Mais baixo que o do motor de propósito: aqui o que se testa é a borda
      // (validação, ack, broadcast), não regra de jogo. Ainda assim falha o
      // build — é o que impede a suíte de socket de apodrecer.
      thresholds: {
        lines: 90,
        functions: 85,
        branches: 85,
        statements: 90,
      },
    },
  },
});
