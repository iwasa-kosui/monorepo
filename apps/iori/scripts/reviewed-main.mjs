import { fileURLToPath } from 'node:url';

import { runMigrationCommand } from './migration-command.mjs';

export const assertReviewedMain = async (sha, { runCommand = runMigrationCommand, signal } = {}) => {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('Reviewed main is required.');
  const cwd = fileURLToPath(new URL('../../../', import.meta.url));
  const git = (args) =>
    runCommand('git', ['-C', cwd, ...args], {
      cwd,
      env: process.env,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      signal,
    });
  if ((await git(['rev-parse', 'HEAD'])).stdout.trim() !== sha) throw new Error('Reviewed checkout mismatch.');
  if ((await git(['status', '--porcelain', '--untracked-files=no'])).stdout.trim()) {
    throw new Error('Tracked checkout is dirty.');
  }
  await git(['fetch', '--no-tags', 'origin', 'main']);
  if ((await git(['rev-parse', 'origin/main'])).stdout.trim() !== sha) throw new Error('Reviewed main changed.');
};
