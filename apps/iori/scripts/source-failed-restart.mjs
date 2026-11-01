import { constants } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

import { runMigrationCommand } from './migration-command.mjs';
import { assertSourceControlDirectory } from './source-deploy-guard.mjs';
import { absent, createSourceServiceControl, readSourceMarker } from './source-service-control.mjs';
import { sourceIdentitySchema } from './source-transfer-protocol.mjs';

const restartRecordSchema = sourceIdentitySchema.extend({
  restart_run_id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
});
export const runFailedSourceRestart = async (
  { sha, runId, restartRunId },
  {
    home = homedir(),
    uid = process.getuid?.(),
    guard = assertSourceControlDirectory,
    runCommand = runMigrationCommand,
    signal,
    captureOutput,
  } = {},
) => {
  if (
    !/^[a-f0-9]{40}$/.test(sha ?? '') || !/^[A-Za-z0-9_-]{1,80}$/.test(runId ?? '')
    || !/^[A-Za-z0-9_-]{1,80}$/.test(restartRunId ?? '')
  ) {
    throw new Error('Invalid source restart operation.');
  }
  const base = join(home, '.iori-migration');
  const recordPath = join(base, 'queue-failed-restart.json');
  const { check, service, assertServiceControl, readServiceState } = createSourceServiceControl({
    home,
    uid,
    guard,
    runCommand,
    signal,
    captureOutput,
  });
  await check();
  if (!await absent(join(base, 'freeze.pending'))) throw new Error('Source pending freeze is present.');
  const freezePath = join(base, 'freeze.json');
  if (await absent(freezePath)) throw new Error('Source freeze is not committed.');
  const { identity } = await readSourceMarker(
    freezePath,
    uid,
    sourceIdentitySchema,
    'Source freeze is invalid.',
  );
  if (identity.main_sha !== sha || identity.run_id !== runId) throw new Error('Source freeze identity mismatch.');
  let staleRecord = false;
  if (!await absent(recordPath)) {
    const { identity: record } = await readSourceMarker(
      recordPath,
      uid,
      restartRecordSchema,
      'Source restart record is invalid.',
    );
    if (record.main_sha === sha && record.run_id === runId) throw new Error('Source restart was already attempted.');
    staleRecord = true;
  }
  await assertServiceControl();
  await check();
  try {
    if (staleRecord) await unlink(recordPath);
    const file = await open(
      recordPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(JSON.stringify({ main_sha: sha, run_id: runId, restart_run_id: restartRunId }));
    } finally {
      await file.close();
    }
  } catch {
    throw new Error('Source restart record failed.');
  }
  process.stderr.write('IORI_NOTICE stage=restart-failed-source recorded=1\n');
  await service('stop', 'Source service stop failed.');
  const state = await readServiceState();
  if (!['inactive', 'failed'].includes(state)) throw new Error('Source service is not stopped.');
  process.stderr.write('IORI_NOTICE stage=restart-failed-source stopped=1\n');
  await service('start', 'Source service start failed.');
  process.stderr.write('IORI_NOTICE stage=restart-failed-source started=1\n');
};
