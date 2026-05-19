import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const talksRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const themeName = process.argv[2];

if (!themeName) {
  console.error('Usage: pnpm --filter talks dev:theme <theme>');
  console.error('Run `pnpm --filter talks list` to see available themes.');
  process.exit(1);
}

const examplePath = join(talksRoot, 'themes', themeName, 'example.md');
if (!existsSync(examplePath)) {
  console.error(`example.md not found: ${examplePath}`);
  process.exit(1);
}

execSync(`pnpm exec slidev themes/${themeName}/example.md --open`, {
  cwd: talksRoot,
  stdio: 'inherit',
});
