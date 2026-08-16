import { defineConfig } from 'drizzle-kit';

/**
 * As migrações são versionadas em `drizzle/` e aplicadas no boot do servidor —
 * não por um comando manual que alguém esquece de rodar no deploy.
 * `drizzle-kit generate` só é usado para escrever o SQL a partir do esquema.
 */
export default defineConfig({
  schema: './src/persistence/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://ilhavera:ilhavera@localhost:5432/ilhavera',
  },
});
