import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
it.each(['rehearse-migration', 'migrate-data', 'verify-import', 'cutover-route'])(
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
      expect(files.includes('receipt-private.pem')).toBe(
        operation === 'migrate-data' || operation === 'rehearse-migration',
      );
      expect(mapped.IORI_MIGRATION_REHEARSAL).toBeUndefined();
      expect(mapped.IORI_MIGRATION_REHEARSAL_PATH !== undefined).toBe(operation === 'migrate-data');
      expect((await readdir(join(paths.base, 'config'))).includes('rehearsal.json')).toBe(operation === 'migrate-data');
      expect(files.includes('source-key')).toBe(operation !== 'verify-import');
    } finally {
      await rm(runnerTemp, { recursive: true, force: true });
    }
  },
);
it.each(['resume-source', 'release-pending-freeze'])(
  'materializes only the source SSH files for %s',
  async operation => {
    const runnerTemp = await createFixtureDirectory('iori-hosted-');
    try {
      const paths = await createWorkflowDirectory(runnerTemp);
      const mapped = await materializeHostedValues({
        ...baseEnv(operation),
        IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40),
        IORI_RECOVERY: operation === 'resume-source' ? 'destination_writes_reconciled' : '',
        RUNNER_TEMP: runnerTemp,
        IORI_PRIVATE_DIRECTORY: paths.base,
        IORI_SOURCE_SSH_PRIVATE_KEY: 'synthetic-source-key',
        IORI_SOURCE_SSH_KNOWN_HOSTS: 'synthetic-trusted-host',
        IORI_MIGRATION_RECEIPT_PUBLIC_KEY: 'synthetic-public-key',
      });
      expect((await readdir(join(paths.base, 'keys'))).sort()).toEqual(['source-key', 'source-known-hosts']);
      expect(await readFile(mapped.IORI_SOURCE_SSH_IDENTITY_FILE!, 'utf8')).toBe('synthetic-source-key\n');
      expect(mapped.IORI_SOURCE_SSH_PRIVATE_KEY).toBeUndefined();
      expect(mapped.IORI_SOURCE_SSH_KNOWN_HOSTS).toBeUndefined();
      expect(mapped.IORI_MIGRATION_RECEIPT_PUBLIC_KEY).toBeUndefined();
    } finally {
      await rm(runnerTemp, { recursive: true, force: true });
    }
  },
);
it('maps the recovery operations to their fixed scripts', async () => {
  const text = await readFile(new URL('../hosted-workflow.mjs', import.meta.url), 'utf8');
  for (
    const [name, script] of [['resume-source', 'resume-source.mjs'], [
      'release-pending-freeze',
      'release-pending-freeze.mjs',
    ]]
  ) {
    expect(text).toContain(`'${name}': '${script}',`);
    expect((await lstat(new URL(`../${script}`, import.meta.url))).isFile()).toBe(true);
  }
});
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
it('relays only the exact configuration owner notice to the public log', async () => {
  const writes = captureStderr();
  const accepted = 'IORI_NOTICE stage=remote-configuration-owner previous_uid=1001 previous_gid=1002';
  await publishChildDiagnostics([
    accepted,
    `${accepted} extra=/home/secret`,
    ` ${accepted}`,
    'IORI_NOTICE stage=remote-configuration-owner previous_uid=abc previous_gid=1002',
    'IORI_NOTICE stage=remote-configuration-owner previous_uid=1 previous_gid=12345678901',
    'IORI_NOTICE stage=remote-install previous_uid=1 previous_gid=1',
  ].join('\n'));
  expect(writes).toEqual([`${accepted}\n`]);
});
it('relays only the exact release-pending-freeze notice to the public log', async () => {
  const writes = captureStderr();
  const accepted = 'IORI_NOTICE stage=release-pending-freeze renamed=1';
  await publishChildDiagnostics([
    accepted,
    `${accepted} extra=/home/secret`,
    ` ${accepted}`,
    `${accepted} `,
    'IORI_NOTICE stage=release-pending-freeze renamed=2',
    'IORI_NOTICE stage=release-pending-freeze renamed=1 path=/home/secret/freeze.pending.rejected-run1',
    'IORI_NOTICE stage=release-pending-freeze',
  ].join('\n'));
  expect(writes).toEqual([`${accepted}\n`]);
});
it('relays the recovery diagnostics reasons within the public vocabulary', async () => {
  const writes = captureStderr();
  const lines = [
    'IORI_DIAG stage=resume-precheck program=ssh exit=none signal=none reason=source-not-frozen',
    'IORI_DIAG stage=resume program=ssh exit=none signal=none reason=source-operation-failed',
    'IORI_DIAG stage=resume-verify program=ssh exit=none signal=none reason=resume-not-confirmed',
    'IORI_DIAG stage=release-remote program=ssh exit=1 signal=none reason=pending-identity-mismatch',
    'IORI_DIAG stage=release-verify program=ssh exit=none signal=none reason=release-not-confirmed',
  ];
  await publishChildDiagnostics(lines.join('\n'));
  expect(writes).toEqual(lines.map(line => `${line}\n`));
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
