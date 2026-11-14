import { rm } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';

import { runHostedWorkflow } from '../hosted-workflow.mjs';
import { runMigrationCommand } from '../migration-command.mjs';
import { assertReviewedMain } from '../reviewed-main.mjs';
import { createWorkflowDirectory } from '../workflow-context.mjs';
import { createFixtureDirectory } from './fixtureTemp.js';

vi.mock('../reviewed-main.mjs', () => ({ assertReviewedMain: vi.fn(async () => {}) }));
vi.mock('../migration-command.mjs', () => ({
  runMigrationCommand: vi.fn(async () => ({ stdout: '', stderr: '' })),
}));

const codeSha = 'a'.repeat(40);
afterEach(() => {
  vi.clearAllMocks();
});
const migrationDiagnostics = async (
  operation: string,
  prepare: { main?: (calls: number) => Error | undefined },
) => {
  const writes: string[] = [];
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(
    ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stderr.write,
  );
  let mainCalls = 0;
  vi.mocked(runMigrationCommand).mockClear();
  vi.mocked(assertReviewedMain).mockImplementation(async () => {
    mainCalls += 1;
    const error = prepare.main?.(mainCalls);
    if (error) throw error;
  });
  const runnerTemp = await createFixtureDirectory('iori-hosted-');
  try {
    const paths = await createWorkflowDirectory(runnerTemp);
    const error = await runHostedWorkflow('operate', {
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: codeSha,
      MAIN_SHA: codeSha,
      IORI_MIGRATION_RUN_ID: 'run1',
      IORI_ENVIRONMENT: 'staging',
      IORI_GENERATION: 'fixture1',
      IORI_OPERATION: operation,
      IORI_JOB_STARTED_AT: String(Date.now() - 60_000),
      RUNNER_TEMP: runnerTemp,
      IORI_PRIVATE_DIRECTORY: paths.base,
      IORI_PRIVATE_LOG_DIRECTORY: paths.logs,
      IORI_SOURCE_SSH_PRIVATE_KEY: 'synthetic-source-key',
      IORI_SOURCE_SSH_KNOWN_HOSTS: 'synthetic-trusted-host',
    }, new AbortController().signal).then(() => undefined, (reason: unknown) => reason);
    return { error, writes, commands: vi.mocked(runMigrationCommand).mock.calls.length, mainCalls };
  } finally {
    stderr.mockRestore();
    vi.mocked(assertReviewedMain).mockImplementation(async () => {});
    vi.mocked(runMigrationCommand).mockImplementation(async () => ({ stdout: '', stderr: '' }));
    await rm(runnerTemp, { recursive: true, force: true });
  }
};
it.each([
  ['Tracked checkout is dirty.', 'reviewed-checkout-dirty'],
  ['Reviewed main changed.', 'reviewed-main-changed'],
  ['Reviewed checkout mismatch.', 'reviewed-checkout-mismatch'],
])('prints the reviewed-main stage and reason when the check fails with "%s"', async (message, reason) => {
  const result = await migrationDiagnostics('deploy-worker', { main: () => new Error(message) });
  expect(result.writes).toEqual([
    `IORI_DIAG stage=hosted-reviewed-main program=none exit=none signal=none reason=${reason}\n`,
  ]);
  expect(result.commands).toBe(0);
});
