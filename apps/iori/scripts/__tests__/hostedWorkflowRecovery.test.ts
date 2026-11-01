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
const migrationSha = 'b'.repeat(40);
afterEach(() => {
  vi.clearAllMocks();
});
it.each([
  ['resume-source', 'resume-source.mjs', 'destination_writes_reconciled'],
  ['resume-source', 'resume-source.mjs', 'destination_writes_not_enabled'],
  ['release-pending-freeze', 'release-pending-freeze.mjs', undefined],
  ['restart-failed-source', 'restart-failed-source.mjs', undefined],
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
