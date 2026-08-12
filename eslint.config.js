import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Lista de builtins do Node. Usada para impedir que o motor de regras
 * (packages/rules) toque em qualquer I/O — ver §6.3 do roadmap.
 */
const NODE_BUILTINS = [
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'crypto',
  'dns',
  'fs',
  'http',
  'https',
  'net',
  'os',
  'path',
  'process',
  'stream',
  'timers',
  'tls',
  'url',
  'util',
  'worker_threads',
  'zlib',
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.turbo/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `x == null` cobre null e undefined de uma vez; é idioma consagrado e
      // exatamente o que se quer ao ler campos opcionais do grafo do tabuleiro.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',
    },
  },

  /**
   * ⭐ REGRA DE FRONTEIRA (import boundaries) — §6.3 do roadmap.
   *
   * `packages/rules` é o motor puro e determinístico. Ele não pode importar
   * nada de `apps/`, nenhum builtin de Node, nenhuma biblioteca de I/O, e não
   * pode usar fontes de não-determinismo (Date, Math.random, crypto).
   *
   * Isso não é preferência de estilo: é o que garante que o replay a partir do
   * log de ações reproduz a partida bit a bit, e o que permite rodar o mesmo
   * motor no servidor e no navegador.
   */
  {
    files: ['packages/rules/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...NODE_BUILTINS.flatMap((name) => [
              {
                name,
                message: 'packages/rules é puro: nenhum builtin de Node é permitido.',
              },
              {
                name: `node:${name}`,
                message: 'packages/rules é puro: nenhum builtin de Node é permitido.',
              },
            ]),
            {
              name: '@ilhavera/protocol',
              message:
                'packages/rules não pode depender do protocolo de rede — a dependência é no sentido oposto.',
            },
          ],
          patterns: [
            {
              group: ['**/apps/**', '@ilhavera/cli', '@ilhavera/server', '@ilhavera/web'],
              message: 'packages/rules não pode importar nada de apps/.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message:
            'Não-determinístico. O motor não conhece tempo; timestamps entram como dado da ação.',
        },
        {
          name: 'crypto',
          message: 'Não-determinístico. Use o PRNG semeado em src/rng.ts.',
        },
        {
          name: 'process',
          message: 'packages/rules é puro: sem acesso ao ambiente.',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Não-determinístico. Use o PRNG semeado em src/rng.ts.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Não-determinístico. O motor não conhece tempo.',
        },
      ],
    },
  },

  /**
   * O `protocol` deixou de ser só esquemas quando ganhou a tradução
   * comando→ação: agora depende de `rules` e é compartilhado com o cliente da
   * Fase 3. A seta permitida é `protocol → rules`; qualquer coisa vinda de
   * `apps/` inverteria a direção e prenderia o pacote ao servidor.
   */
  {
    files: ['packages/protocol/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apps/**', '@ilhavera/cli', '@ilhavera/server', '@ilhavera/web'],
              message: 'packages/protocol não pode importar nada de apps/.',
            },
          ],
        },
      ],
    },
  },

  /**
   * Os testes do motor podem usar Date/random para gerar seeds e medir tempo —
   * eles são o mundo externo, não o motor.
   */
  {
    files: ['packages/rules/test/**/*.ts', 'packages/rules/src/**/*.test.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off',
    },
  },
);
