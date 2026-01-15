import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { Env } from './src/env.ts';

export default defineConfig({
  out: './drizzle',
  schema: './src/adaptor/pg/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: Env.getInstance().DATABASE_URL,
  }, tablesFilter: ['!fedify_kv_v2', '!fedify_message_v2']
});
