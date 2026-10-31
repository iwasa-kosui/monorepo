import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import {
  createWorkflowDirectory,
  parseWorkflowInvocation,
  workflowTimeBudget,
  writePrivateValue,
} from '../workflow-context.mjs';

const env = {
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: 'a'.repeat(40),
  MAIN_SHA: 'a'.repeat(40),
  IORI_MIGRATION_MAIN_SHA: 'a'.repeat(40),
  IORI_MIGRATION_RUN_ID: 'fixture',
  IORI_ENVIRONMENT: 'staging',
  IORI_GENERATION: 'fixture01',
  IORI_OPERATION: 'migrate-data',
};
it('binds protected invocation to reviewed main and separates maintenance code from immutable migration SHA', () => {
  expect(parseWorkflowInvocation(env)).toMatchObject({ codeSha: env.MAIN_SHA, migrationSha: env.MAIN_SHA });
  expect(() => parseWorkflowInvocation({ ...env, GITHUB_REF: 'refs/heads/feature' })).toThrow();
  expect(() => parseWorkflowInvocation({ ...env, IORI_MIGRATION_RUN_ID: '../bad' })).toThrow();
  expect(() => parseWorkflowInvocation({ ...env, IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40) })).toThrow();
  expect(parseWorkflowInvocation({ ...env, IORI_OPERATION: 'deploy-worker', IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40) }))
    .toMatchObject({ migrationSha: 'b'.repeat(40), codeSha: env.MAIN_SHA });
  expect(() => parseWorkflowInvocation({ ...env, IORI_OPERATION: 'replace-queue-consumer' })).toThrow(
    'Maintenance operation requires a separate review.',
  );
});
const frozenSha = 'b'.repeat(40);
const recoveryEnv = (operation: string, recovery?: string) => ({
  ...env,
  IORI_OPERATION: operation,
  IORI_MIGRATION_MAIN_SHA: frozenSha,
  ...(recovery === undefined ? {} : { IORI_RECOVERY: recovery }),
});
it.each(['destination_writes_not_enabled', 'destination_writes_reconciled'])(
  'accepts resume-source with recovery %s and a migration SHA different from the current main',
  (recovery) => {
    expect(parseWorkflowInvocation(recoveryEnv('resume-source', recovery))).toMatchObject({
      operation: 'resume-source',
      codeSha: env.MAIN_SHA,
      migrationSha: frozenSha,
      runId: env.IORI_MIGRATION_RUN_ID,
    });
  },
);
it.each([undefined, '', 'destination_writes_not_enabled ', 'Destination_writes_reconciled', 'reconciled', 'true'])(
  'rejects resume-source with recovery %j',
  (recovery) => {
    expect(() => parseWorkflowInvocation(recoveryEnv('resume-source', recovery))).toThrow(
      'Protected workflow invocation is invalid.',
    );
  },
);
it.each(['resume-source', 'release-pending-freeze'])('requires a 40 digit hex migration SHA for %s', (operation) => {
  const recovery = operation === 'resume-source' ? 'destination_writes_reconciled' : undefined;
  const valid = recoveryEnv(operation, recovery);
  expect(parseWorkflowInvocation(valid)).toMatchObject({ migrationSha: frozenSha });
  for (const sha of [undefined, '', 'b'.repeat(39), 'B'.repeat(40), `${'b'.repeat(39)}g`, `${frozenSha}0`]) {
    expect(() => parseWorkflowInvocation({ ...valid, IORI_MIGRATION_MAIN_SHA: sha })).toThrow();
  }
});
it('accepts release-pending-freeze only without recovery and with a different migration SHA', () => {
  expect(parseWorkflowInvocation(recoveryEnv('release-pending-freeze'))).toMatchObject({
    operation: 'release-pending-freeze',
    codeSha: env.MAIN_SHA,
    migrationSha: frozenSha,
  });
  expect(parseWorkflowInvocation(recoveryEnv('release-pending-freeze', ''))).toMatchObject({ migrationSha: frozenSha });
  for (const recovery of ['destination_writes_not_enabled', 'destination_writes_reconciled', 'x']) {
    expect(() => parseWorkflowInvocation(recoveryEnv('release-pending-freeze', recovery))).toThrow(
      'Protected workflow invocation is invalid.',
    );
  }
});
it.each(['resume-source', 'release-pending-freeze'])('keeps the common checks for %s', (operation) => {
  const valid = recoveryEnv(operation, operation === 'resume-source' ? 'destination_writes_reconciled' : undefined);
  expect(() => parseWorkflowInvocation({ ...valid, GITHUB_REF: 'refs/heads/feature' })).toThrow();
  expect(() => parseWorkflowInvocation({ ...valid, GITHUB_EVENT_NAME: 'push' })).toThrow();
  expect(() => parseWorkflowInvocation({ ...valid, IORI_MIGRATION_RUN_ID: '../bad' })).toThrow();
  expect(() => parseWorkflowInvocation({ ...valid, IORI_MIGRATION_RUN_ID: '' })).toThrow();
  expect(() => parseWorkflowInvocation({ ...valid, IORI_ENVIRONMENT: 'development' })).toThrow();
});
it('keeps requiring equal code and migration SHAs for the other non-deploy operations', () => {
  for (const operation of ['prepare-target', 'migrate-data', 'verify-import', 'cutover-route']) {
    expect(() => parseWorkflowInvocation({ ...env, IORI_OPERATION: operation, IORI_MIGRATION_MAIN_SHA: frozenSha }))
      .toThrow();
  }
});
it('accepts the rehearsal operation under the same invocation binding as data migration', () => {
  expect(parseWorkflowInvocation({ ...env, IORI_OPERATION: 'rehearse-migration' })).toMatchObject({
    operation: 'rehearse-migration',
    codeSha: env.MAIN_SHA,
    migrationSha: env.MAIN_SHA,
  });
  expect(() =>
    parseWorkflowInvocation({
      ...env,
      IORI_OPERATION: 'rehearse-migration',
      IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40),
    })
  ).toThrow();
});
it('reserves activation and cleanup within the whole hosted job deadline', () => {
  expect(workflowTimeBudget(1_000, 61_000)).toMatchObject({ remainingMs: 344 * 60_000, verificationMs: 329 * 60_000 });
  expect(() => workflowTimeBudget(1_000, 331 * 60_000 + 1_000)).toThrow();
});
it('creates fresh private directories and exclusive values without overwriting input files', async () => {
  const runnerTemp = await mkdtemp(join(tmpdir(), 'iori-workflow-fixture-'));
  try {
    const result = await createWorkflowDirectory(runnerTemp);
    expect((await lstat(result.base)).mode & 0o777).toBe(0o700);
    await writePrivateValue(result.keys, 'public.pem', 'synthetic-public');
    expect((await lstat(join(result.keys, 'public.pem'))).mode & 0o777).toBe(0o600);
    await expect(writePrivateValue(result.keys, 'public.pem', 'replacement')).rejects.toThrow();
    expect(await readFile(join(result.keys, 'public.pem'), 'utf8')).toBe('synthetic-public');
    await expect(writePrivateValue(result.keys, '../escape', 'value')).rejects.toThrow();
    await writeFile(join(runnerTemp, 'file'), 'x');
    await expect(createWorkflowDirectory(join(runnerTemp, 'file'))).rejects.toThrow();
  } finally {
    await rm(runnerTemp, { recursive: true, force: true });
  }
});
