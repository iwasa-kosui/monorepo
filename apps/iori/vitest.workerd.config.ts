import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const migrationsDirectory = fileURLToPath(new URL('./drizzle-d1', import.meta.url));
const migrationFiles = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();
const migrations = await Promise.all(
  migrationFiles.map(async (file) => ({
    name: file,
    queries: (await readFile(`${migrationsDirectory}/${file}`, 'utf8'))
      .split('--> statement-breakpoint')
      .map((query) => query.trim())
      .filter((query) => query.length > 0),
  })),
);

const ogFontBase64 = (
  await readFile(fileURLToPath(new URL('../nen-diagnosis/scripts/fonts/NotoSansJP-Bold.ttf', import.meta.url)))
).toString('base64');

export default defineWorkersConfig({
  test: {
    include: ['workerd-tests/**/*.test.ts'],
    setupFiles: ['./workerd-tests/applyMigrations.ts'],
    testTimeout: 60_000,
    poolOptions: {
      workers: {
        singleWorker: true,
        isolatedStorage: false,
        main: './.wrangler/workerd-bundle/worker.js',
        wrangler: { configPath: './workers/iori/wrangler.local.jsonc' },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations, TEST_OG_FONT_BASE64: ogFontBase64 },
        },
      },
    },
  },
});
