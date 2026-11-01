import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

const execFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  execFileSync.mockImplementation(actual.execFileSync);
  return { ...actual, execFileSync };
});

const { assertExternalMigrationPath } = await import('../migration-path-safety.mjs');

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

it('resolves the repository root once and reuses it', async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'iori-paths-'));
  directories.push(root);
  await assertExternalMigrationPath(root);
  await assertExternalMigrationPath(root);
  expect(execFileSync).toHaveBeenCalledTimes(1);
  expect(execFileSync).toHaveBeenCalledWith('git', ['rev-parse', '--show-toplevel'], expect.anything());
});

it('does not keep a failed repository root lookup and runs git rev-parse again on the next call', async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'iori-paths-'));
  directories.push(root);
  vi.resetModules();
  const fresh = await import('../migration-path-safety.mjs');
  execFileSync.mockClear();
  execFileSync.mockImplementationOnce(() => {
    throw new Error('git failed');
  });
  await expect(fresh.assertExternalMigrationPath(root)).rejects.toThrow('git failed');
  await expect(fresh.assertExternalMigrationPath(root)).resolves.toBeTypeOf('string');
  expect(execFileSync).toHaveBeenCalledTimes(2);
  expect(execFileSync).toHaveBeenLastCalledWith('git', ['rev-parse', '--show-toplevel'], expect.anything());
});
