import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));
const include = ['src/**/*.test.ts', 'scripts/**/*.test.ts'];

const testFilesUnder = (directory: string): string[] =>
  readdirSync(join(root, directory), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.test.ts'))
    .map((file) => relative(root, join(root, directory, file)));

// モジュールやグローバルを差し替えるテストは isolated、それ以外は shared のプロジェクトに分ける。
// test:ci は shared だけを --no-isolate で走らせ、ワーカーでモジュールを使い回して読み込みの時間を省く。
// （vitest 3.1 ではプロジェクトごとの isolate が効かないため、CLI の引数で切り替える）
const sharedStatePatterns = [
  /vi\.(mock|doMock|stubGlobal|stubEnv|resetModules)\(/,
  /process\.env\.[A-Z_]+ *=/,
  /globalThis\.[a-zA-Z]+ *=/,
];
const mutatesSharedState = (file: string): boolean => {
  const source = readFileSync(join(root, file), 'utf8');
  return sharedStatePatterns.some((pattern) => pattern.test(source));
};
const isolatedFiles = ['src', 'scripts'].flatMap(testFilesUnder).filter(mutatesSharedState);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/useCase/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**'],
    },
    workspace: [
      { extends: true, test: { name: 'isolated', include: isolatedFiles } },
      { extends: true, test: { name: 'shared', include, exclude: isolatedFiles } },
    ],
  },
});
