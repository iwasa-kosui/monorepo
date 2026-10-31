import { constants } from 'node:fs';
import { lstat, open, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { runMigrationCommand } from './migration-command.mjs';
import { assertSourceControlDirectory } from './source-deploy-guard.mjs';
import { sourceIdentitySchema } from './source-transfer-protocol.mjs';

const pendingLimitBytes = 1024;
const absent = async (path) => {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    throw error;
  }
};
export const runPendingFreezeRelease = async (
  { sha, runId },
  {
    home = homedir(),
    uid = process.getuid?.(),
    guard = assertSourceControlDirectory,
    runCommand = runMigrationCommand,
    signal,
    captureOutput,
  } = {},
) => {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[A-Za-z0-9_-]{1,80}$/.test(runId ?? '')) {
    throw new Error('Invalid source release operation.');
  }
  const base = join(home, '.iori-migration');
  const pendingPath = join(base, 'freeze.pending');
  const check = async () => {
    signal?.throwIfAborted();
    await guard({ home, uid });
  };
  const exec = (program, args, capture = captureOutput) =>
    runCommand(program, args, {
      cwd: home,
      env: { ...process.env, PATH: '/usr/bin:/bin' },
      timeout: 5 * 60_000,
      maxBuffer: 8_000_000,
      signal,
      captureOutput: capture,
    });
  const service = async (action, message) => {
    await check();
    try {
      await exec('sudo', ['-n', 'systemctl', action, 'microblog']);
    } catch {
      signal?.throwIfAborted();
      throw new Error(message);
    }
  };
  await service('stop', 'Source service stop failed.');
  let state = '';
  await exec('systemctl', ['is-active', 'microblog'], async (result) => {
    state = result.stdout.trim();
    await captureOutput?.(result);
  }).catch(() => {});
  signal?.throwIfAborted();
  if (!['inactive', 'failed'].includes(state)) throw new Error('Source service is not stopped.');
  await check();
  if (!await absent(join(base, 'freeze.json'))) throw new Error('Source freeze is already committed.');
  let before;
  let identity;
  try {
    before = await lstat(pendingPath);
    if (!before.isFile() || before.uid !== uid || before.size > pendingLimitBytes) throw new Error();
    const file = await open(pendingPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await file.stat();
      if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw new Error();
      const buffer = Buffer.alloc(pendingLimitBytes + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > pendingLimitBytes) throw new Error();
      identity = sourceIdentitySchema.parse(JSON.parse(buffer.toString('utf8', 0, bytesRead)));
    } finally {
      await file.close();
    }
  } catch {
    throw new Error('Source pending freeze is invalid.');
  }
  if (identity.main_sha !== sha || identity.run_id !== runId) {
    throw new Error('Source pending freeze identity mismatch.');
  }
  const rejectedPath = join(base, `freeze.pending.rejected-${runId}`);
  if (!await absent(rejectedPath)) throw new Error('Source release destination exists.');
  await check();
  try {
    await rename(pendingPath, rejectedPath);
  } catch {
    throw new Error('Source release rename verification failed.');
  }
  process.stderr.write('IORI_NOTICE stage=release-pending-freeze renamed=1\n');
  try {
    const moved = await lstat(rejectedPath);
    if (moved.dev !== before.dev || moved.ino !== before.ino) throw new Error();
  } catch {
    throw new Error('Source release rename verification failed.');
  }
  await service('start', 'Source service start failed.');
};
