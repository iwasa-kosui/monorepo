import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle-d1',
  schema: './src/adaptor/d1/schema.ts',
  dialect: 'sqlite',
});
