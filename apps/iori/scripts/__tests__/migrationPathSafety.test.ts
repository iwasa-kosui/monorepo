import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertExternalMigrationRoot, resolveMigrationArtifactPath } from '../migration-path-safety.mjs';

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
  it('resolves nested empty NDJSON files without requiring evidence content', async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, 'nested'), { mode: 0o700 });
    await writeFile(join(root, 'nested', 'empty.ndjson'), '', { mode: 0o600 });
    await expect(resolveMigrationArtifactPath(root, 'nested/empty.ndjson')).resolves.toBe(
      join(root, 'nested', 'empty.ndjson'),
    );
  });
  it.each(['../outside', '/absolute', 'C:/file', 'C:file', '.', 'a/./b', 'a//b', 'a/../b', 'a\\b', 'file\0name', ''])(
    'rejects unsafe reference %j',
    async (reference) => {
      await expect(resolveMigrationArtifactPath(await temporaryRoot(), reference)).rejects.toThrow();
    },
  );
  it('rejects intermediate and leaf symlink escapes', async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await writeFile(join(outside, 'file'), 'private', { mode: 0o600 });
    await symlink(outside, join(root, 'nested'));
    await symlink(join(outside, 'file'), join(root, 'leaf'));
    await expect(resolveMigrationArtifactPath(root, 'nested/file')).rejects.toThrow('symlink');
    await expect(resolveMigrationArtifactPath(root, 'leaf')).rejects.toThrow('symlink');
  });
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
