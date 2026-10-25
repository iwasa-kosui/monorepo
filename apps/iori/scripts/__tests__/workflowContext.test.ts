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
