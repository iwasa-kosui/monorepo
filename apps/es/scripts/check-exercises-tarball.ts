import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

const appDir = join(import.meta.dirname, '..');
const tarball = join(appDir, 'dist', 'es-patchwork-exercises.tar.gz');
const workDir = mkdtempSync(join(tmpdir(), 'es-patchwork-exercises-check-'));

const listFiles = (dir: string) =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((path) => !path.split(sep).some((part) => part === 'node_modules' || part === '.DS_Store'))
    .sort();
const listAllFiles = (dir: string) => readdirSync(dir, { recursive: true, encoding: 'utf8' }).sort();

const errors: string[] = [];

if (
  !readFileSync(join(appDir, 'dist', 'setup', 'index.html'), 'utf8').includes('href="/es-patchwork-exercises.tar.gz"')
) {
  errors.push('事前準備のページに tarball へのリンクがありません');
}

try {
  const extracted = spawnSync('tar', ['-xf', tarball, '-C', workDir], { encoding: 'utf8' });
  if (extracted.status !== 0) {
    throw new Error(`tarball を展開できません: ${extracted.stderr}`);
  }
  const root = join(workDir, 'es-patchwork-exercises');

  if (listAllFiles(root).join('\n') !== listFiles(join(appDir, 'exercises')).join('\n')) {
    errors.push('tarball のファイルの一覧が exercises/ と違います');
  }

  const runTests = (dir: string) =>
    spawnSync(process.execPath, ['--test', '--test-reporter=spec', 'visits.test.ts'], {
      cwd: join(root, dir),
      encoding: 'utf8',
    });

  const start = runTests('chapter-1-start');
  if (start.status === 0 || !/pass 4\b/.test(start.stdout) || !/fail 4\b/.test(start.stdout)) {
    errors.push(`chapter-1-start: 事前準備のページの説明（pass 4、fail 4）と結果が違います\n${start.stdout}`);
  }
  const done = runTests('chapter-2-step-2');
  if (done.status !== 0) {
    errors.push(`chapter-2-step-2: 展開先でテストが成功しません\n${done.stdout}`);
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('tarball は想定どおりです');
