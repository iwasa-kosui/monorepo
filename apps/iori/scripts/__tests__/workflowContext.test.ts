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
it('accepts the purge operation and lets its migration SHA differ from the code SHA like deploy-worker', () => {
  expect(parseWorkflowInvocation({ ...env, IORI_OPERATION: 'purge-rehearsal-target' })).toMatchObject({
    operation: 'purge-rehearsal-target',
    codeSha: env.MAIN_SHA,
    migrationSha: env.MAIN_SHA,
    generation: env.IORI_GENERATION,
    runId: env.IORI_MIGRATION_RUN_ID,
  });
  const purge = { ...env, IORI_OPERATION: 'purge-rehearsal-target' };
  expect(parseWorkflowInvocation({ ...purge, IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40) })).toMatchObject({
    operation: 'purge-rehearsal-target',
    codeSha: env.MAIN_SHA,
    migrationSha: 'b'.repeat(40),
  });
  expect(() => parseWorkflowInvocation({ ...purge, IORI_MIGRATION_MAIN_SHA: 'not-a-sha' })).toThrow();
  expect(() => parseWorkflowInvocation({ ...purge, GITHUB_SHA: 'b'.repeat(40) })).toThrow();
  expect(() => parseWorkflowInvocation({ ...purge, IORI_GENERATION: '' })).toThrow();
  expect(() => parseWorkflowInvocation({ ...purge, IORI_MIGRATION_RUN_ID: '' })).toThrow();
  expect(() => parseWorkflowInvocation({ ...purge, IORI_GENERATION: 'Upper_Case' })).toThrow();
});
it.each(['rehearse-migration', 'migrate-data', 'verify-import', 'cutover-route', 'estimate-source'])(
  'still requires the code SHA and migration SHA to match for %s',
  operation => {
    const given = operation === 'estimate-source'
      ? { IORI_GENERATION: '', IORI_MIGRATION_RUN_ID: '' }
      : {};
    const invocation = { ...env, ...given, IORI_OPERATION: operation };
    expect(parseWorkflowInvocation(invocation)).toMatchObject({ operation });
    expect(() => parseWorkflowInvocation({ ...invocation, IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40) })).toThrow(
      'Protected workflow invocation is invalid.',
    );
  },
);
it.each([undefined, ''])('accepts the estimate operation only without generation and run ID (%s)', empty => {
  const estimate = { ...env, IORI_OPERATION: 'estimate-source', IORI_GENERATION: empty, IORI_MIGRATION_RUN_ID: empty };
  expect(parseWorkflowInvocation(estimate)).toMatchObject({
    operation: 'estimate-source',
    codeSha: env.MAIN_SHA,
    migrationSha: env.MAIN_SHA,
  });
  expect(() => parseWorkflowInvocation({ ...estimate, IORI_GENERATION: env.IORI_GENERATION })).toThrow(
    'Protected workflow invocation is invalid.',
  );
  expect(() => parseWorkflowInvocation({ ...estimate, IORI_MIGRATION_RUN_ID: env.IORI_MIGRATION_RUN_ID })).toThrow(
    'Protected workflow invocation is invalid.',
  );
  expect(() =>
    parseWorkflowInvocation({
      ...estimate,
      IORI_GENERATION: env.IORI_GENERATION,
      IORI_MIGRATION_RUN_ID: env.IORI_MIGRATION_RUN_ID,
    })
  ).toThrow('Protected workflow invocation is invalid.');
  expect(() => parseWorkflowInvocation({ ...estimate, IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40) })).toThrow();
  expect(() => parseWorkflowInvocation({ ...estimate, GITHUB_REF: 'refs/heads/feature' })).toThrow();
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
