import { chmod, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertExternalMigrationRoot } from '../migration-path-safety.mjs';

const directories: string[] = [];
const temporaryRoot = async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'iori-paths-'));
  directories.push(root);
  return root;
};
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
describe('migration artifact paths', () => {
  it('rejects repository, symlink, missing, non-directory and public roots', async () => {
    const root = await temporaryRoot();
    await expect(assertExternalMigrationRoot(process.cwd())).rejects.toThrow('repository');
    await symlink(root, join(root, 'alias'));
    await expect(assertExternalMigrationRoot(join(root, 'alias'))).rejects.toThrow('symlink');
    await expect(assertExternalMigrationRoot(join(root, 'missing'))).rejects.toThrow();
    await writeFile(join(root, 'file'), '', { mode: 0o600 });
    await expect(assertExternalMigrationRoot(join(root, 'file'))).rejects.toThrow('root');
    await chmod(root, 0o755);
    await expect(assertExternalMigrationRoot(root)).rejects.toThrow('root');
  });
});
