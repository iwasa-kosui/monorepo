import { constants } from 'node:fs';
import { link, lstat, open, unlink } from 'node:fs/promises';
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
  const rejectedPath = join(base, `freeze.pending.rejected-${runId}`);
  const readMarker = async (path) => {
    try {
      const before = await lstat(path);
      if (!before.isFile() || before.uid !== uid || before.size > pendingLimitBytes) throw new Error();
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const opened = await file.stat();
        if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw new Error();
        const buffer = Buffer.alloc(pendingLimitBytes + 1);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead > pendingLimitBytes) throw new Error();
        const identity = sourceIdentitySchema.parse(JSON.parse(buffer.toString('utf8', 0, bytesRead)));
        return { before, identity };
      } finally {
        await file.close();
      }
    } catch {
      throw new Error('Source pending freeze is invalid.');
    }
  };
  const assertIdentity = (identity) => {
    if (identity.main_sha !== sha || identity.run_id !== runId) {
      throw new Error('Source pending freeze identity mismatch.');
    }
  };
  const inspect = async () => {
    if (!await absent(join(base, 'freeze.json'))) throw new Error('Source freeze is already committed.');
    if (await absent(pendingPath)) {
      if (await absent(rejectedPath)) throw new Error('Source pending freeze is invalid.');
      const { before, identity } = await readMarker(rejectedPath);
      assertIdentity(identity);
      return { kind: 'renamed', before };
    }
    const { before, identity } = await readMarker(pendingPath);
    assertIdentity(identity);
    if (await absent(rejectedPath)) return { kind: 'pending', before };
    const existing = await lstat(rejectedPath);
    if (existing.dev === before.dev && existing.ino === before.ino) return { kind: 'linked', before };
    throw new Error('Source release destination exists.');
  };
  await check();
  const planned = await inspect();
  if (planned.kind === 'renamed') {
    process.stderr.write('IORI_NOTICE stage=release-pending-freeze already_renamed=1\n');
    await service('start', 'Source service start failed.');
    return;
  }
  await service('stop', 'Source service stop failed.');
  let state = '';
  await exec('systemctl', ['is-active', 'microblog'], async (result) => {
    state = result.stdout.trim();
    await captureOutput?.(result);
  }).catch(() => {});
  signal?.throwIfAborted();
  if (!['inactive', 'failed'].includes(state)) throw new Error('Source service is not stopped.');
  await check();
  const { kind, before } = await inspect();
  if (kind !== planned.kind || before.dev !== planned.before.dev || before.ino !== planned.before.ino) {
    throw new Error('Source pending freeze is invalid.');
  }
  await check();
  const same = (stat) => stat.dev === before.dev && stat.ino === before.ino;
  if (kind === 'pending') {
    try {
      await link(pendingPath, rejectedPath);
    } catch (error) {
      throw new Error(
        error?.code === 'EEXIST' ? 'Source release destination exists.' : 'Source release rename verification failed.',
      );
    }
  }
  try {
    if (!same(await lstat(rejectedPath)) || !same(await lstat(pendingPath))) throw new Error();
    await unlink(pendingPath);
  } catch {
    throw new Error('Source release rename verification failed.');
  }
  process.stderr.write('IORI_NOTICE stage=release-pending-freeze renamed=1\n');
  try {
    if (!same(await lstat(rejectedPath))) throw new Error();
  } catch {
    throw new Error('Source release rename verification failed.');
  }
  await service('start', 'Source service start failed.');
};
