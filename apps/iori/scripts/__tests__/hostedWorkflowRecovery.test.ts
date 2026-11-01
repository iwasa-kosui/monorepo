import { rm } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';

import { hostedFailureMessage, runHostedWorkflow } from '../hosted-workflow.mjs';
import { runMigrationCommand } from '../migration-command.mjs';
import { assertReviewedMain } from '../reviewed-main.mjs';
import { createWorkflowDirectory } from '../workflow-context.mjs';
import { createFixtureDirectory } from './fixtureTemp.js';

vi.mock('../reviewed-main.mjs', () => ({ assertReviewedMain: vi.fn(async () => {}) }));
vi.mock('../migration-command.mjs', () => ({
  runMigrationCommand: vi.fn(async () => ({ stdout: '', stderr: '' })),
}));

const codeSha = 'a'.repeat(40);
const migrationSha = 'b'.repeat(40);
afterEach(() => {
  vi.clearAllMocks();
});
it.each([
  ['resume-source', 'resume-source.mjs', 'destination_writes_reconciled'],
  ['resume-source', 'resume-source.mjs', 'destination_writes_not_enabled'],
  ['release-pending-freeze', 'release-pending-freeze.mjs', undefined],
])(
  'runs %s against the reviewed code SHA and never reads the migration target',
  async (operation, script, recovery) => {
    const runnerTemp = await createFixtureDirectory('iori-hosted-');
    try {
      const paths = await createWorkflowDirectory(runnerTemp);
      await runHostedWorkflow('operate', {
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: codeSha,
        MAIN_SHA: codeSha,
        IORI_MIGRATION_MAIN_SHA: migrationSha,
        IORI_MIGRATION_RUN_ID: 'run1',
        IORI_ENVIRONMENT: 'staging',
        IORI_GENERATION: 'fixture1',
        IORI_OPERATION: operation,
        ...(recovery === undefined ? {} : { IORI_RECOVERY: recovery }),
        IORI_JOB_STARTED_AT: String(Date.now() - 60_000),
        RUNNER_TEMP: runnerTemp,
        IORI_PRIVATE_DIRECTORY: paths.base,
        IORI_PRIVATE_LOG_DIRECTORY: paths.logs,
        IORI_SOURCE_SSH_PRIVATE_KEY: 'synthetic-source-key',
        IORI_SOURCE_SSH_KNOWN_HOSTS: 'synthetic-trusted-host',
      }, new AbortController().signal);
      expect(vi.mocked(assertReviewedMain).mock.calls.map(call => call[0])).toEqual([codeSha]);
      const commands = vi.mocked(runMigrationCommand).mock.calls as unknown as [string, string[], { env: object }][];
      expect(commands.map(([, args]) => args)).toEqual([[`apps/iori/scripts/${script}`]]);
      expect(commands[0][0]).toBe(process.execPath);
      expect(commands[0][2].env).not.toHaveProperty('IORI_WORKER_BINDINGS_PATH');
    } finally {
      await rm(runnerTemp, { recursive: true, force: true });
    }
  },
);
it('reports prepare-target stopped before resources when the operation command exits with 78', async () => {
  const writes: string[] = [];
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(
    ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stderr.write,
  );
  vi.mocked(runMigrationCommand).mockRejectedValueOnce(
    Object.assign(new Error('Migration command failed; outcome may be uncertain.'), { exitCode: 78, signal: null }),
  );
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
      IORI_OPERATION: 'prepare-target',
      IORI_JOB_STARTED_AT: String(Date.now() - 60_000),
      RUNNER_TEMP: runnerTemp,
      IORI_PRIVATE_DIRECTORY: paths.base,
      IORI_PRIVATE_LOG_DIRECTORY: paths.logs,
    }, new AbortController().signal).then(() => undefined, (reason: unknown) => reason);
    const commands = vi.mocked(runMigrationCommand).mock.calls as unknown as [string, string[]][];
    expect(commands.map(([, args]) => args)).toEqual([['apps/iori/scripts/prepare-migration-target.mjs']]);
    expect(error).toBeInstanceOf(Error);
    expect(writes).toEqual([
      'IORI_DIAG stage=hosted-operation program=node exit=78 signal=none reason=stopped-before-resources\n',
    ]);
    expect(hostedFailureMessage(error)).toBe(
      'Target preparation stopped before creating resources; fix the inputs and rerun with the same generation.',
    );
  } finally {
    stderr.mockRestore();
    await rm(runnerTemp, { recursive: true, force: true });
  }
});
