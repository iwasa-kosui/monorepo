import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

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

const workerBundle = './.wrangler/workerd-bundle/worker.js';
const workerBundlePath = fileURLToPath(new URL(workerBundle, import.meta.url));

export default defineConfig({
  plugins: [
    {
      // `@cloudflare/vitest-plugin` は、モジュールとそのソースマップを 1 通の WebSocket メッセージで workerd に送る。
      // workerd が受け取れるのは 32MiB までで、十数 MB あるバンドルにソースマップを足すと超えて起動時に落ちる。
      // バンドルのソースマップは使わないので、空にして送らせない。
      name: 'iori:drop-worker-bundle-sourcemap',
      enforce: 'post',
      transform: (code, id) => (id === workerBundlePath ? { code, map: { mappings: '' } } : undefined),
    },
    cloudflareTest({
      main: workerBundle,
      wrangler: { configPath: './workers/iori/wrangler.local.jsonc' },
      miniflare: {
        bindings: { TEST_MIGRATIONS: migrations, TEST_OG_FONT_BASE64: ogFontBase64 },
      },
    }),
  ],
  test: {
    include: ['workerd-tests/**/*.test.ts'],
    setupFiles: ['./workerd-tests/applyMigrations.ts'],
    testTimeout: 60_000,
    // ストレージを共有するので、テストファイルは 1 つずつ順に走らせる。
    maxWorkers: 1,
    // sanitize-html が読む postcss は、browser 向けに source-map-js などを空モジュールへ差し替える。
    // workerd の require ではこの差し替え先を解決できないので、Vite に事前バンドルさせる。
    deps: { optimizer: { ssr: { enabled: true, include: ['sanitize-html'] } } },
  },
});
