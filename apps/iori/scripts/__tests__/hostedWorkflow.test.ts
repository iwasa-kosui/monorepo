import { lstat, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { materializeHostedValues, publishChildDiagnostics, runHostedWorkflow } from '../hosted-workflow.mjs';
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
it.each(['migrate-data', 'verify-import', 'cutover-route'])(
  'materializes %s into a new private root with only its required file roles',
  async operation => {
    const runnerTemp = await createFixtureDirectory('iori-hosted-');
    try {
      const paths = await createWorkflowDirectory(runnerTemp);
      const env = {
        ...baseEnv(operation),
        RUNNER_TEMP: runnerTemp,
        IORI_PRIVATE_DIRECTORY: paths.base,
        IORI_SOURCE_SSH_PRIVATE_KEY: 'synthetic-source-key',
        IORI_SOURCE_SSH_KNOWN_HOSTS: 'synthetic-trusted-host',
        IORI_MIGRATION_RECEIPT_PUBLIC_KEY: 'synthetic-public-key',
        IORI_MIGRATION_RECEIPT_PRIVATE_KEY: 'synthetic-signing-key',
        IORI_MIGRATION_REHEARSAL: '{}',
      };
      const mapped = await materializeHostedValues(env);
      expect(await readdir(mapped.IORI_MIGRATION_ROOT!)).toEqual([]);
      expect((await lstat(mapped.IORI_MIGRATION_ROOT!)).mode & 0o777).toBe(0o700);
      expect((await lstat(mapped.IORI_MIGRATION_RECEIPT_PUBLIC_KEY_PATH!)).mode & 0o777).toBe(0o600);
      expect(await readFile(mapped.IORI_MIGRATION_RECEIPT_PUBLIC_KEY_PATH!, 'utf8')).toBe('synthetic-public-key');
      expect(mapped.IORI_MIGRATION_RECEIPT_PUBLIC_KEY).toBeUndefined();
      expect(mapped.IORI_MIGRATION_RECEIPT_PRIVATE_KEY).toBeUndefined();
      expect(mapped.IORI_SOURCE_SSH_PRIVATE_KEY).toBeUndefined();
      const files = await readdir(join(paths.base, 'keys'));
      expect(files.includes('receipt-private.pem')).toBe(operation === 'migrate-data');
      expect(files.includes('source-key')).toBe(operation !== 'verify-import');
    } finally {
      await rm(runnerTemp, { recursive: true, force: true });
    }
  },
);
it.each([
  ['without a trailing newline', 'synthetic-source-key'],
  ['with a trailing newline', 'synthetic-source-key\n'],
])('writes the source SSH key %s as a single newline-terminated file', async (_label, key) => {
  const runnerTemp = await createFixtureDirectory('iori-hosted-');
  try {
    const paths = await createWorkflowDirectory(runnerTemp);
    const mapped = await materializeHostedValues({
      ...baseEnv('source'),
      RUNNER_TEMP: runnerTemp,
      IORI_PRIVATE_DIRECTORY: paths.base,
      IORI_SOURCE_SSH_PRIVATE_KEY: key,
      IORI_SOURCE_SSH_KNOWN_HOSTS: 'synthetic-trusted-host',
    });
    expect(await readFile(mapped.IORI_SOURCE_SSH_IDENTITY_FILE!, 'utf8')).toBe('synthetic-source-key\n');
    expect(await readFile(mapped.IORI_SOURCE_SSH_KNOWN_HOSTS_FILE!, 'utf8')).toBe('synthetic-trusted-host');
  } finally {
    await rm(runnerTemp, { recursive: true, force: true });
  }
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
