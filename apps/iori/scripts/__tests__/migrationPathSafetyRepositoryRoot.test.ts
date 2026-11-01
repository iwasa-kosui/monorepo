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
