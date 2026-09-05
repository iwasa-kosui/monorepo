import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPublicArtifactViolations } from './publicArtifactPolicy.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(appRoot, '..', '..');

const trackedFiles = execFileSync('git', ['ls-files'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).split('\n').filter(Boolean);

const requiresContentInspection = (path) =>
  path.startsWith('apps/iori/workers/iori/')
  || path.startsWith('apps/iori/infra/cloudflare/')
  || path.startsWith('.github/workflows/');

const files = (await Promise.all(trackedFiles.map(async (path) => {
  try {
    return {
      path,
      text: requiresContentInspection(path)
        ? await readFile(resolve(repositoryRoot, path), 'utf8')
        : '',
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}))).filter((file) => file !== undefined);

const violations = findPublicArtifactViolations({ files });
if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
}
