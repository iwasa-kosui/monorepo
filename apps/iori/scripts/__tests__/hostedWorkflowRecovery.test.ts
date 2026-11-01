import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { hostedFailureMessage, runHostedWorkflow } from '../hosted-workflow.mjs';
import { runMigrationCommand } from '../migration-command.mjs';
import { assertReviewedMain } from '../reviewed-main.mjs';
import { createWorkflowDirectory } from '../workflow-context.mjs';
import { createFixtureDirectory } from './fixtureTemp.js';
import { expectedTargetFixture } from './migrationTargetFixture.js';

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
it('runs diagnose-source against the reviewed code SHA without generation, run ID or migration SHA', async () => {
  const runnerTemp = await createFixtureDirectory('iori-hosted-');
  try {
    const paths = await createWorkflowDirectory(runnerTemp);
    await runHostedWorkflow('operate', {
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: codeSha,
      MAIN_SHA: codeSha,
      IORI_MIGRATION_MAIN_SHA: '',
      IORI_MIGRATION_RUN_ID: '',
      IORI_ENVIRONMENT: 'production',
      IORI_GENERATION: '',
      IORI_OPERATION: 'diagnose-source',
      IORI_RECOVERY: '',
      IORI_JOB_STARTED_AT: String(Date.now() - 60_000),
      RUNNER_TEMP: runnerTemp,
      IORI_PRIVATE_DIRECTORY: paths.base,
      IORI_PRIVATE_LOG_DIRECTORY: paths.logs,
      IORI_SOURCE_SSH_PRIVATE_KEY: 'synthetic-source-key',
      IORI_SOURCE_SSH_KNOWN_HOSTS: 'synthetic-trusted-host',
    }, new AbortController().signal);
    expect(vi.mocked(assertReviewedMain).mock.calls.map(call => call[0])).toEqual([codeSha]);
    const commands = vi.mocked(runMigrationCommand).mock.calls as unknown as [string, string[], { env: object }][];
    expect(commands.map(([, args]) => args)).toEqual([['apps/iori/scripts/diagnose-source.mjs']]);
    expect(commands[0][2].env).not.toHaveProperty('IORI_WORKER_BINDINGS_PATH');
  } finally {
    await rm(runnerTemp, { recursive: true, force: true });
  }
});
const migrationDiagnostics = async (
  operation: string,
  prepare: { readChild?: (env: Record<string, string>) => Promise<void>; main?: (calls: number) => Error | undefined },
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
  vi.mocked(runMigrationCommand).mockImplementation(
    (async (
      _program: string,
      _args: string[],
      options: { env: Record<string, string> },
    ) => {
      await prepare.readChild?.(options.env);
      return { stdout: '', stderr: '' };
    }) as unknown as typeof runMigrationCommand,
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
      IORI_OPERATION: operation,
      IORI_JOB_STARTED_AT: String(Date.now() - 60_000),
      RUNNER_TEMP: runnerTemp,
      IORI_PRIVATE_DIRECTORY: paths.base,
      IORI_PRIVATE_LOG_DIRECTORY: paths.logs,
      IORI_SOURCE_SSH_PRIVATE_KEY: 'synthetic-source-key',
      IORI_SOURCE_SSH_KNOWN_HOSTS: 'synthetic-trusted-host',
      IORI_MIGRATION_RECEIPT_PUBLIC_KEY: 'synthetic-public-key',
      IORI_MIGRATION_RECEIPT_PRIVATE_KEY: 'synthetic-signing-key',
      IORI_MIGRATION_REHEARSAL: '{}',
    }, new AbortController().signal).then(() => undefined, (reason: unknown) => reason);
    return { error, writes, commands: vi.mocked(runMigrationCommand).mock.calls.length, mainCalls };
  } finally {
    stderr.mockRestore();
    vi.mocked(assertReviewedMain).mockImplementation(async () => {});
    vi.mocked(runMigrationCommand).mockImplementation(async () => ({ stdout: '', stderr: '' }));
    await rm(runnerTemp, { recursive: true, force: true });
  }
};
const writeExpectedTarget = async (env: Record<string, string>, body = JSON.stringify(expectedTargetFixture())) =>
  writeFile(env.IORI_MIGRATION_EXPECTED_TARGET_PATH!, body, { mode: 0o600 });
const commandFailure = (exitCode: number) =>
  Object.assign(new Error('Migration command failed; outcome may be uncertain.'), { exitCode, signal: null });
it.each(['rehearse-migration', 'migrate-data', 'verify-import', 'cutover-route', 'purge-rehearsal-target'])(
  'reports the %s target read as its own stage when the read command fails',
  async (operation) => {
    const result = await migrationDiagnostics(operation, {
      readChild: async () => {
        throw commandFailure(1);
      },
    });
    expect(result.writes).toEqual([
      'IORI_DIAG stage=hosted-target-read program=node exit=1 signal=none reason=command-failed\n',
    ]);
    expect(result.commands).toBe(1);
  },
);
it('reports the target load as its own stage when the read command leaves no expected target', async () => {
  const result = await migrationDiagnostics('migrate-data', {});
  expect(result.writes).toEqual([
    'IORI_DIAG stage=hosted-target-load program=none exit=none signal=none reason=fs-enoent\n',
  ]);
});
it('reports the target load with the identity reason when the expected target is not valid', async () => {
  const result = await migrationDiagnostics('migrate-data', { readChild: env => writeExpectedTarget(env, '{}') });
  expect(result.writes).toEqual([
    'IORI_DIAG stage=hosted-target-load program=none exit=none signal=none reason=identity-mismatch\n',
  ]);
});
it('reports the binding write as its own stage when the bindings file already exists', async () => {
  const result = await migrationDiagnostics('migrate-data', {
    readChild: async (env) => {
      await writeExpectedTarget(env);
      await writeFile(join(env.IORI_PRIVATE_DIRECTORY!, 'config/worker-bindings.json'), '{}', { mode: 0o600 });
    },
  });
  expect(result.writes).toEqual([
    'IORI_DIAG stage=hosted-binding-write program=none exit=none signal=none reason=fs-eexist\n',
  ]);
  expect(result.mainCalls).toBe(1);
});
it.each([
  ['Tracked checkout is dirty.', 'reviewed-checkout-dirty'],
  ['Reviewed main changed.', 'reviewed-main-changed'],
  ['Reviewed checkout mismatch.', 'reviewed-checkout-mismatch'],
])('tells the second reviewed-main check apart from the first when it fails with "%s"', async (message, reason) => {
  const second = await migrationDiagnostics('migrate-data', {
    readChild: writeExpectedTarget,
    main: calls => calls === 2 ? new Error(message) : undefined,
  });
  expect(second.writes).toEqual([
    `IORI_DIAG stage=hosted-main-recheck program=none exit=none signal=none reason=${reason}\n`,
  ]);
  expect(second.mainCalls).toBe(2);
  const first = await migrationDiagnostics('migrate-data', { main: () => new Error(message) });
  expect(first.writes).toEqual([
    `IORI_DIAG stage=hosted-reviewed-main program=none exit=none signal=none reason=${reason}\n`,
  ]);
  expect(first.commands).toBe(0);
});
it('tells a failed git command apart from a dirty checkout or a moved main in the second check', async () => {
  const result = await migrationDiagnostics('migrate-data', {
    readChild: writeExpectedTarget,
    main: calls => calls === 2 ? commandFailure(128) : undefined,
  });
  expect(result.writes).toEqual([
    'IORI_DIAG stage=hosted-main-recheck program=none exit=none signal=none reason=command-failed\n',
  ]);
});
it('runs the operation after the target read, the load, the binding write and the second check succeed', async () => {
  const result = await migrationDiagnostics('migrate-data', { readChild: writeExpectedTarget });
  expect(result.error).toBeUndefined();
  expect(result.writes).toEqual([]);
  expect(result.commands).toBe(2);
  expect(result.mainCalls).toBe(2);
});
