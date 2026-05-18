import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

const exportedNames = ['main', 'installTrigger', 'uninstallTrigger'];

await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'App',
  target: 'es2020',
  platform: 'neutral',
  outfile: 'dist/Code.js',
  minify: true,
  logLevel: 'info',
  footer: {
    js: exportedNames
      .map((name) => `function ${name}() { return App.${name}.apply(this, arguments); }`)
      .join('\n'),
  },
});

await copyFile('appsscript.json', 'dist/appsscript.json');
console.log('built dist/Code.js and copied appsscript.json');
