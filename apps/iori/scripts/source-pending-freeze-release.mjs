import { link, lstat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { runMigrationCommand } from './migration-command.mjs';
import { assertSourceControlDirectory } from './source-deploy-guard.mjs';
import { absent, createSourceServiceControl, readSourceMarker } from './source-service-control.mjs';

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
  const { check, service, assertServiceControl, readServiceState } = createSourceServiceControl({
    home,
    uid,
    guard,
    runCommand,
    signal,
    captureOutput,
  });
  const rejectedPath = join(base, `freeze.pending.rejected-${runId}`);
  const readMarker = path => readSourceMarker(path, uid);
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
  await assertServiceControl();
  if (planned.kind === 'renamed') {
    process.stderr.write('IORI_NOTICE stage=release-pending-freeze already_renamed=1\n');
    await service('start', 'Source service start failed.');
    return;
  }
  await service('stop', 'Source service stop failed.');
  const state = await readServiceState();
  if (!['inactive', 'failed'].includes(state)) throw new Error('Source service is not stopped.');
  process.stderr.write('IORI_NOTICE stage=release-pending-freeze stopped=1\n');
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
