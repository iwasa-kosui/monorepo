import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';

import {
  executeHostedOperation,
  materializeHostedValues,
  publishChildDiagnostics,
  runHostedWorkflow,
} from '../hosted-workflow.mjs';
import { createWorkflowDirectory } from '../workflow-context.mjs';
import { createFixtureDirectory } from './fixtureTemp.js';
const baseEnv = (operation: string) => ({
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: 'a'.repeat(40),
  MAIN_SHA: 'a'.repeat(40),
  IORI_ENVIRONMENT: 'staging',
  IORI_GENERATION: 'fixture1',
  IORI_MIGRATION_RUN_ID: 'run1',
  IORI_OPERATION: operation,
});
it.each(['resume-source', 'release-pending-freeze', 'restart-failed-source', 'diagnose-source'])(
  'materializes only the source SSH files for %s',
  async operation => {
    const runnerTemp = await createFixtureDirectory('iori-hosted-');
    try {
      const paths = await createWorkflowDirectory(runnerTemp);
      const mapped = await materializeHostedValues({
        ...baseEnv(operation),
        ...(operation === 'diagnose-source'
          ? { IORI_GENERATION: '', IORI_MIGRATION_RUN_ID: '' }
          : { IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40) }),
        IORI_RECOVERY: operation === 'resume-source' ? 'destination_writes_reconciled' : '',
        RUNNER_TEMP: runnerTemp,
        IORI_PRIVATE_DIRECTORY: paths.base,
        IORI_SOURCE_SSH_PRIVATE_KEY: 'synthetic-source-key',
        IORI_SOURCE_SSH_KNOWN_HOSTS: 'synthetic-trusted-host',
      });
      expect((await readdir(join(paths.base, 'keys'))).sort()).toEqual(['source-key', 'source-known-hosts']);
      expect(await readFile(mapped.IORI_SOURCE_SSH_IDENTITY_FILE!, 'utf8')).toBe('synthetic-source-key\n');
      expect(mapped.IORI_SOURCE_SSH_PRIVATE_KEY).toBeUndefined();
      expect(mapped.IORI_SOURCE_SSH_KNOWN_HOSTS).toBeUndefined();
    } finally {
      await rm(runnerTemp, { recursive: true, force: true });
    }
  },
);
it('hands a main push deploy-worker the generation, run ID and migration SHA taken from the admission identity', async () => {
  const runnerTemp = await createFixtureDirectory('iori-hosted-');
  try {
    const paths = await createWorkflowDirectory(runnerTemp);
    const identity = JSON.stringify({
      environment: 'production',
      generation: 'prd20261102a',
      mainSha: 'c'.repeat(40),
      runId: 'run-1',
    });
    const env = {
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: 'a'.repeat(40),
      MAIN_SHA: 'a'.repeat(40),
      IORI_ENVIRONMENT: 'production',
      IORI_OPERATION: 'deploy-worker',
      IORI_ADMISSION_IDENTITY: identity,
      RUNNER_TEMP: runnerTemp,
      IORI_PRIVATE_DIRECTORY: paths.base,
    };
    const mapped = await materializeHostedValues(env);
    expect(mapped.IORI_GENERATION).toBe('prd20261102a');
    expect(mapped.IORI_MIGRATION_RUN_ID).toBe('run-1');
    expect(mapped.IORI_MIGRATION_MAIN_SHA).toBe('c'.repeat(40));
    expect(mapped.MAIN_SHA).toBe('a'.repeat(40));
    await expect(materializeHostedValues({ ...env, IORI_ADMISSION_IDENTITY: '{}' })).rejects.toThrow(
      'Protected workflow invocation is invalid.',
    );
    await expect(materializeHostedValues({ ...env, IORI_OPERATION: 'put-worker-secrets' })).rejects.toThrow(
      'Protected workflow invocation is invalid.',
    );
  } finally {
    await rm(runnerTemp, { recursive: true, force: true });
  }
});
it('rejects the source operation on a main push', async () => {
  await expect(
    materializeHostedValues({
      ...baseEnv('source'),
      GITHUB_EVENT_NAME: 'push',
      IORI_PRIVATE_DIRECTORY: '/not-inspected',
    }),
  ).rejects.toThrow('Invalid source invocation.');
});
it('rejects a retired operation before even examining any local secret path', async () => {
  await expect(
    materializeHostedValues({ ...baseEnv('replace-queue-consumer'), IORI_PRIVATE_DIRECTORY: '/not-inspected' }),
  ).rejects.toThrow('separate review');
});

afterEach(() => {
  vi.restoreAllMocks();
});
const captureStderr = () => {
  const writes: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation(
    ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stderr.write,
  );
  return writes;
};
it('relays only exact fixed-vocabulary diagnostic lines to the public log', async () => {
  const writes = captureStderr();
  const accepted = 'IORI_DIAG stage=remote-check program=ssh exit=255 signal=none reason=ssh-auth-denied';
  await publishChildDiagnostics([
    'secret-user@secret-host.invalid: Permission denied (publickey).',
    accepted,
    `${accepted} extra=/home/secret`,
    ` ${accepted}`,
    'IORI_DIAG stage=remote-check program=ssh exit=255 signal=none reason=Secret_Value',
    'IORI_DIAG stage=remote-check program=bash exit=1 signal=none reason=x',
    'IORI_DIAG stage=remote-check program=ssh exit=1 signal=none reason=a/b',
    '-----BEGIN OPENSSH PRIVATE KEY-----',
  ].join('\n'));
  expect(writes).toEqual([`${accepted}\n`]);
});
it('prints a hosted diagnostic before the failure for an invalid source invocation', async () => {
  const writes = captureStderr();
  await expect(
    runHostedWorkflow('operate', {
      ...baseEnv('source'),
      GITHUB_EVENT_NAME: 'pull_request',
      IORI_PRIVATE_DIRECTORY: '/secret/private',
    }, new AbortController().signal),
  ).rejects.toThrow('Invalid source invocation.');
  expect(writes).toEqual([
    'IORI_DIAG stage=hosted-invocation program=none exit=none signal=none reason=invalid-source-invocation\n',
  ]);
});
it('relays a failed child diagnostic and its hosted diagnostic without raw child output', async () => {
  const writes = captureStderr();
  const directory = await createFixtureDirectory('iori-hosted-');
  try {
    const logs = join(directory, 'logs');
    await mkdir(logs, { mode: 0o700 });
    const script = join(directory, 'child.mjs');
    await writeFile(
      script,
      [
        'console.error(\'-----BEGIN OPENSSH PRIVATE KEY-----\');',
        'console.error(\'IORI_DIAG stage=remote-check program=ssh exit=255 signal=none reason=ssh-auth-denied\');',
        'process.exit(1);',
      ].join('\n'),
    );
    await expect(
      executeHostedOperation(
        'deploy-source',
        script,
        { IORI_PRIVATE_LOG_DIRECTORY: logs },
        new AbortController().signal,
        60_000,
      ),
    ).rejects.toThrow('Migration command failed');
    expect(writes).toEqual([
      'IORI_DIAG stage=remote-check program=ssh exit=255 signal=none reason=ssh-auth-denied\n',
      'IORI_DIAG stage=hosted-deploy-source program=node exit=1 signal=none reason=command-failed\n',
    ]);
    expect(writes.join('')).not.toContain('PRIVATE KEY');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it.each([
  ['deploy-active-worker.mjs', 'deploy-worker-before'],
])('publishes the stage line of the real %s CLI that fails without configuration', async (script, stage) => {
  const writes = captureStderr();
  const directory = await createFixtureDirectory('iori-hosted-');
  try {
    const logs = join(directory, 'logs');
    await mkdir(logs, { mode: 0o700 });
    const error = await executeHostedOperation(
      'operation',
      fileURLToPath(new URL(`../${script}`, import.meta.url)),
      { IORI_PRIVATE_LOG_DIRECTORY: logs },
      new AbortController().signal,
      60_000,
    ).then(() => undefined, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(writes).toEqual([
      `IORI_DIAG stage=${stage} program=none exit=none signal=none reason=config-invalid\n`,
      'IORI_DIAG stage=hosted-operation program=node exit=1 signal=none reason=command-failed\n',
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
