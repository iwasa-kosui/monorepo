import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const talksRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const target = process.argv[2];

if (!target) {
  console.error('Usage: pnpm --filter talks dev <year>/<name>');
  console.error('Run `pnpm --filter talks list` to see available targets.');
  process.exit(1);
}

const slidesPath = join(talksRoot, target, 'slides.md');
if (!existsSync(slidesPath)) {
  console.error(`slides.md not found: ${slidesPath}`);
  process.exit(1);
}

execSync(`pnpm exec slidev ${target}/slides.md --open`, {
  cwd: talksRoot,
  stdio: 'inherit',
});
