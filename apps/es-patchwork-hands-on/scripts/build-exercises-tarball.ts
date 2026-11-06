import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const appDir = join(import.meta.dirname, '..');
const outFile = join(appDir, 'dist', 'es-patchwork-exercises.tar.gz');
const workDir = mkdtempSync(join(tmpdir(), 'es-patchwork-exercises-'));

try {
  cpSync(join(appDir, 'exercises'), join(workDir, 'es-patchwork-exercises'), {
    recursive: true,
    filter: (source) => !['node_modules', '.DS_Store'].includes(basename(source)),
  });
  const result = spawnSync('tar', ['-czf', outFile, '-C', workDir, 'es-patchwork-exercises'], {
    stdio: 'inherit',
    // macOS の tar が拡張属性を ._ ファイルとして含めないようにする
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  if (result.status !== 0) {
    throw new Error(`tar の終了コードが 0 ではありません（${result.status}）`);
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
console.log(`${outFile} を作りました`);
