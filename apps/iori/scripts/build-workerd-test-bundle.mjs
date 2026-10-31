import { build } from 'esbuild';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

await build({
  absWorkingDir: root,
  entryPoints: ['src/worker.ts'],
  outfile: '.wrangler/workerd-bundle/worker.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  conditions: ['workerd', 'worker', 'browser'],
  mainFields: ['browser', 'module', 'main'],
  external: ['cloudflare:*', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
  banner: {
    js:
      'import { createRequire as __createRequire } from \'node:module\';const require = __createRequire(\'file:///worker.js\');',
  },
  loader: { '.wasm': 'copy' },
  logLevel: 'warning',
});
