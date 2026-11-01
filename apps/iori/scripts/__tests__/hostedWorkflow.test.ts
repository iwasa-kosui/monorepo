import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';

import {
  executeHostedOperation,
  hostedFailureMessage,
  materializeHostedValues,
  publishChildDiagnostics,
  runHostedWorkflow,
} from '../hosted-workflow.mjs';
import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
import { preparationFailureReport } from '../prepare-migration-target.mjs';
import { SOURCE_REJECTION_DETAILS, SOURCE_SSH_REASONS } from '../source-transfer-protocol.mjs';
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
    const [name, script] of [
      ['resume-source', 'resume-source.mjs'],
      [
        'release-pending-freeze',
        'release-pending-freeze.mjs',
      ],
      ['restart-failed-source', 'restart-failed-source.mjs'],
      ['diagnose-source', 'diagnose-source.mjs'],
    ]
  ) {
    expect(text).toContain(`'${name}': '${script}',`);
    expect((await lstat(new URL(`../${script}`, import.meta.url))).isFile()).toBe(true);
  }
});
it('materializes estimate-source with only the source SSH files and no generation or run ID', async () => {
  const runnerTemp = await createFixtureDirectory('iori-hosted-');
  try {
    const paths = await createWorkflowDirectory(runnerTemp);
    const mapped = await materializeHostedValues({
      ...baseEnv('estimate-source'),
      IORI_GENERATION: '',
      IORI_MIGRATION_RUN_ID: '',
      RUNNER_TEMP: runnerTemp,
      IORI_PRIVATE_DIRECTORY: paths.base,
      IORI_SOURCE_SSH_PRIVATE_KEY: 'synthetic-source-key',
      IORI_SOURCE_SSH_KNOWN_HOSTS: 'synthetic-trusted-host',
    });
    expect((await readdir(join(paths.base, 'keys'))).sort()).toEqual(['source-key', 'source-known-hosts']);
    expect(await readdir(mapped.IORI_MIGRATION_ROOT!)).toEqual([]);
    expect(await readdir(join(paths.base, 'config'))).toEqual([]);
    expect(await readFile(mapped.IORI_SOURCE_SSH_IDENTITY_FILE!, 'utf8')).toBe('synthetic-source-key\n');
    expect(mapped.IORI_SOURCE_SSH_PRIVATE_KEY).toBeUndefined();
    expect(mapped.IORI_MIGRATION_RECEIPT_PUBLIC_KEY_PATH).toBeUndefined();
  } finally {
    await rm(runnerTemp, { recursive: true, force: true });
  }
});
it.each([
  { IORI_GENERATION: 'fixture1' },
  { IORI_MIGRATION_RUN_ID: 'run1' },
])('rejects estimate-source when generation or run ID is supplied (%j)', async given => {
  await expect(
    materializeHostedValues({
      ...baseEnv('estimate-source'),
      IORI_GENERATION: '',
      IORI_MIGRATION_RUN_ID: '',
      ...given,
      IORI_PRIVATE_DIRECTORY: '/not-inspected',
    }),
  ).rejects.toThrow('Protected workflow invocation is invalid.');
});
it('hands purge-rehearsal-target the migration SHA as MAIN_SHA while the invocation keeps the code SHA', async () => {
  const runnerTemp = await createFixtureDirectory('iori-hosted-');
  try {
    const paths = await createWorkflowDirectory(runnerTemp);
    const env = {
      ...baseEnv('purge-rehearsal-target'),
      IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40),
      RUNNER_TEMP: runnerTemp,
      IORI_PRIVATE_DIRECTORY: paths.base,
    };
    const mapped = await materializeHostedValues(env);
    expect(mapped.MAIN_SHA).toBe('b'.repeat(40));
    expect(mapped.IORI_MIGRATION_RUN_ID).toBe('run1');
    expect(env.MAIN_SHA).toBe('a'.repeat(40));
  } finally {
    await rm(runnerTemp, { recursive: true, force: true });
  }
});
it.each(['rehearse-migration', 'migrate-data', 'verify-import', 'cutover-route'])(
  'rejects %s when the migration SHA differs from the code SHA',
  async operation => {
    await expect(
      materializeHostedValues({
        ...baseEnv(operation),
        IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40),
        IORI_PRIVATE_DIRECTORY: '/not-inspected',
      }),
    ).rejects.toThrow('Protected workflow invocation is invalid.');
  },
);
it('materializes purge-rehearsal-target without SSH, receipt or rehearsal files', async () => {
  const runnerTemp = await createFixtureDirectory('iori-hosted-');
  try {
    const paths = await createWorkflowDirectory(runnerTemp);
    const mapped = await materializeHostedValues({
      ...baseEnv('purge-rehearsal-target'),
      RUNNER_TEMP: runnerTemp,
      IORI_PRIVATE_DIRECTORY: paths.base,
      IORI_SOURCE_SSH_PRIVATE_KEY: 'synthetic-source-key',
      IORI_SOURCE_SSH_KNOWN_HOSTS: 'synthetic-trusted-host',
      IORI_MIGRATION_RECEIPT_PUBLIC_KEY: 'synthetic-public-key',
      IORI_MIGRATION_RECEIPT_PRIVATE_KEY: 'synthetic-signing-key',
      IORI_MIGRATION_REHEARSAL: '{}',
    });
    expect(await readdir(join(paths.base, 'keys'))).toEqual([]);
    expect(await readdir(join(paths.base, 'config'))).toEqual([]);
    expect(await readdir(mapped.IORI_MIGRATION_ROOT!)).toEqual([]);
    for (
      const key of [
        'IORI_SOURCE_SSH_PRIVATE_KEY',
        'IORI_SOURCE_SSH_KNOWN_HOSTS',
        'IORI_MIGRATION_RECEIPT_PUBLIC_KEY',
        'IORI_MIGRATION_RECEIPT_PRIVATE_KEY',
        'IORI_MIGRATION_REHEARSAL',
        'IORI_MIGRATION_REHEARSAL_PATH',
      ]
    ) expect(mapped[key]).toBeUndefined();
  } finally {
    await rm(runnerTemp, { recursive: true, force: true });
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
it('relays only the exact configuration mode notice to the public log', async () => {
  const writes = captureStderr();
  const accepted = 'IORI_NOTICE stage=remote-configuration-mode previous_mode=0644';
  await publishChildDiagnostics([
    accepted,
    `${accepted} extra=/home/secret`,
    ` ${accepted}`,
    'IORI_NOTICE stage=remote-configuration-mode previous_mode=644',
    'IORI_NOTICE stage=remote-configuration-mode previous_mode=0888',
    'IORI_NOTICE stage=remote-configuration-mode previous_mode=01644',
    'IORI_NOTICE stage=remote-install previous_mode=0644',
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
it('relays only the exact already renamed notice to the public log', async () => {
  const writes = captureStderr();
  const accepted = 'IORI_NOTICE stage=release-pending-freeze already_renamed=1';
  await publishChildDiagnostics([
    accepted,
    `${accepted} extra=/home/secret`,
    ` ${accepted}`,
    `${accepted} `,
    `${accepted}\r`,
    'IORI_NOTICE stage=release-pending-freeze already_renamed=0',
    'IORI_NOTICE stage=release-pending-freeze already_renamed=11',
    'IORI_NOTICE stage=release-pending-freeze already_renamed=1 path=/home/secret/freeze.pending.rejected-run1',
    'IORI_NOTICE stage=other already_renamed=1',
    'IORI_NOTICE stage=release-pending-freeze already_renamed',
  ].join('\n'));
  expect(writes).toEqual([`${accepted}\n`]);
});
it('relays only the exact stopped notice to the public log', async () => {
  const writes = captureStderr();
  const accepted = 'IORI_NOTICE stage=release-pending-freeze stopped=1';
  await publishChildDiagnostics([
    accepted,
    `${accepted} extra=/home/secret`,
    ` ${accepted}`,
    `${accepted} `,
    `${accepted}\r`,
    'IORI_NOTICE stage=release-pending-freeze stopped=0',
    'IORI_NOTICE stage=release-pending-freeze stopped=11',
    'IORI_NOTICE stage=release-pending-freeze stopped=1 path=/home/secret/freeze.pending',
    'IORI_NOTICE stage=other stopped=1',
    'IORI_NOTICE stage=release-pending-freeze stopped',
  ].join('\n'));
  expect(writes).toEqual([`${accepted}\n`]);
});
it('relays only the exact restart-failed-source notices to the public log', async () => {
  const writes = captureStderr();
  const accepted = [
    'IORI_NOTICE stage=restart-failed-source recorded=1',
    'IORI_NOTICE stage=restart-failed-source stopped=1',
    'IORI_NOTICE stage=restart-failed-source started=1',
  ];
  await publishChildDiagnostics([
    ...accepted,
    ...accepted.map(line => `${line} extra=/home/secret`),
    ...accepted.map(line => ` ${line}`),
    ...accepted.map(line => `${line}\r`),
    'IORI_NOTICE stage=restart-failed-source recorded=0',
    'IORI_NOTICE stage=restart-failed-source stopped=11',
    'IORI_NOTICE stage=restart-failed-source restarted=1',
    'IORI_NOTICE stage=restart-failed-source started',
    'IORI_NOTICE stage=other recorded=1',
  ].join('\n'));
  expect(writes).toEqual(accepted.map(line => `${line}\n`));
});
it('relays only the exact restart-precheck notice to the public log', async () => {
  const writes = captureStderr();
  const accepted = 'IORI_NOTICE stage=restart-precheck ingress_frozen=1 consumer_paused=1 queue_failed=1 drained=0';
  await publishChildDiagnostics([
    accepted,
    `${accepted} extra=/home/secret`,
    ` ${accepted}`,
    `${accepted}\r`,
    'IORI_NOTICE stage=restart-precheck ingress_frozen=2 consumer_paused=1 queue_failed=1 drained=0',
    'IORI_NOTICE stage=restart-precheck ingress_frozen=1 consumer_paused=1 queue_failed=1',
    'IORI_NOTICE stage=restart-precheck ingress_frozen=1 consumer_paused=1 queue_failed=1 drained=10',
    'IORI_NOTICE stage=restart-precheck ingress_frozen=1 consumer_paused=1 drained=0 queue_failed=1',
    'IORI_NOTICE stage=other ingress_frozen=1 consumer_paused=1 queue_failed=1 drained=0',
  ].join('\n'));
  expect(writes).toEqual([`${accepted}\n`]);
});
it('relays only the exact status-unit notice to the public log', async () => {
  const writes = captureStderr();
  const accepted = 'IORI_NOTICE stage=status-unit active=failed sub=failed result=start-limit-hit restarts=5';
  await publishChildDiagnostics([
    accepted,
    `${accepted} extra=/home/secret`,
    ` ${accepted}`,
    `${accepted} `,
    `${accepted}\r`,
    accepted.replace('result=start-limit-hit', 'result=/home/ec2-user/monorepo'),
    accepted.replace('result=start-limit-hit', 'result=banana'),
    accepted.replace('active=failed', 'active=secret-host'),
    accepted.replace('sub=failed', 'sub=Error: Cannot find module'),
    accepted.replace('restarts=5', 'restarts=1234567'),
    accepted.replace('restarts=5', 'restarts=x'),
    accepted.replace('stage=status-unit', 'stage=other'),
    accepted.replace(' restarts=5', ''),
  ].join('\n'));
  expect(writes).toEqual([`${accepted}\n`]);
});
it('relays only the exact source-diagnose notice to the public log', async () => {
  const writes = captureStderr();
  const accepted =
    `IORI_NOTICE stage=source-diagnose active=failed sub=auto-restart restarts=12 exit_status=1 journal=module-not-found freeze=0 freeze_pending=0 mem_available_mb=312 disk_free_mb=5120 source_revision=${
      'a'.repeat(40)
    } active_enter=20261101T0612Z journal_window_h=6 journal_truncated=0 exits=3 scheduled_restarts=2 jc_module_not_found=4 jc_syntax_error=0 jc_env_invalid=0 jc_port_in_use=1 jc_out_of_memory=0 jc_permission_denied=0 jc_database_unavailable=0 jc_uncaught_exception=7`;
  await publishChildDiagnostics([
    accepted,
    `${accepted} extra=/home/secret`,
    ` ${accepted}`,
    `${accepted} `,
    `${accepted}\r`,
    accepted.replace('journal=module-not-found', 'journal=Error: Cannot find module /home/ec2-user/x'),
    accepted.replace('active=failed', 'active=secret-host'),
    accepted.replace(/source_revision=.*/, 'source_revision=/home/ec2-user/monorepo'),
    accepted.replace(/source_revision=.*/, `source_revision=${'a'.repeat(39)}`),
    accepted.replace('freeze=0', 'freeze=2'),
    accepted.replace('stage=source-diagnose', 'stage=other'),
    accepted.replace(/ active_enter=.*/, ''),
    accepted.replace('jc_uncaught_exception=7', 'jc_uncaught_exception=x'),
  ].join('\n'));
  expect(writes).toEqual([`${accepted}\n`]);
});
it('relays the recovery diagnostics reasons within the public vocabulary', async () => {
  const writes = captureStderr();
  const lines = [
    'IORI_DIAG stage=resume-precheck program=ssh exit=none signal=none reason=source-not-frozen',
    'IORI_DIAG stage=resume program=ssh exit=none signal=none reason=source-operation-failed',
    'IORI_DIAG stage=resume-precheck program=ssh exit=none signal=none reason=source-queue-failed',
    'IORI_DIAG stage=resume-precheck program=ssh exit=none signal=none reason=source-not-idle',
    'IORI_DIAG stage=resume-verify program=ssh exit=none signal=none reason=resume-not-confirmed',
    'IORI_DIAG stage=release-remote program=ssh exit=1 signal=none reason=pending-identity-mismatch',
    'IORI_DIAG stage=release-verify program=ssh exit=none signal=none reason=release-not-confirmed',
    'IORI_DIAG stage=release-remote program=ssh exit=1 signal=none reason=service-control-not-permitted',
    'IORI_DIAG stage=restart-precheck program=ssh exit=none signal=none reason=source-queue-not-failed',
    'IORI_DIAG stage=restart-remote program=ssh exit=1 signal=none reason=restart-already-attempted',
    'IORI_DIAG stage=restart-verify program=ssh exit=none signal=none reason=restart-not-confirmed',
  ];
  await publishChildDiagnostics(lines.join('\n'));
  expect(writes).toEqual(lines.map(line => `${line}\n`));
});
it('relays the estimate-source failure diagnostics and refuses lines with raw text', async () => {
  const writes = captureStderr();
  const lines = [
    ...[...SOURCE_SSH_REASONS, ...SOURCE_REJECTION_DETAILS].map(reason =>
      `IORI_DIAG stage=estimate-source program=ssh exit=1 signal=none reason=${reason}`
    ),
    'IORI_DIAG stage=estimate-source program=ssh exit=none signal=SIGTERM reason=aborted',
    'IORI_DIAG stage=estimate-source program=none exit=none signal=none reason=unclassified',
  ];
  await publishChildDiagnostics([
    ...lines,
    'IORI_DIAG stage=estimate-source program=ssh exit=1 signal=none reason=relation "articles" does not exist',
    'IORI_DIAG stage=estimate-source program=ssh exit=1 signal=none reason=estimate-query detail=password',
    'IORI_DIAG stage=estimate-source program=ssh exit=1 signal=none reason=source.example.test',
    'IORI_DIAG stage=estimate-source program=ssh exit=1 signal=none reason=/home/ec2-user/uploads',
    'IORI_DIAG stage=estimate-source program=ssh exit=1 signal=none reason=Estimate_Query',
    'Source estimate failed.',
  ].join('\n'));
  expect(writes).toEqual(lines.map(line => `${line}\n`));
});
const estimateLine = 'IORI_ESTIMATE rows=5 upload_count=3 article_count=2 sample=ok capacity=insufficient';
it('relays only the exact estimate line to the public log', async () => {
  const writes = captureStderr();
  await publishChildDiagnostics([
    estimateLine,
    'IORI_ESTIMATE rows=0 upload_count=0 article_count=0 sample=insufficient capacity=ok',
    'IORI_ESTIMATE rows=9007199254740991 upload_count=1 article_count=1 sample=ok capacity=ok',
    `${estimateLine} table_bytes=10000`,
    `${estimateLine} extra=/home/secret`,
    ` ${estimateLine}`,
    `${estimateLine} `,
    estimateLine.replace('rows=5', 'rows=5 table_bytes=10000'),
    estimateLine.replace('rows=5', 'rows=0x10'),
    estimateLine.replace('rows=5', 'rows=1e3'),
    estimateLine.replace('rows=5', 'rows=-1'),
    estimateLine.replace('rows=5', 'rows=+1'),
    estimateLine.replace('rows=5', 'rows=1.5'),
    estimateLine.replace('rows=5', 'rows=05'),
    estimateLine.replace('rows=5', 'rows=12345678901234567'),
    estimateLine.replace('rows=5', 'rows='),
    estimateLine.replace('upload_count=3', 'upload_bytes=3'),
    estimateLine.replace('sample=ok', 'sample=yes'),
    estimateLine.replace('capacity=insufficient', 'capacity=unknown'),
    estimateLine.replace('IORI_ESTIMATE', 'IORI_NOTICE'),
    estimateLine.replace('rows=5 upload_count=3', 'upload_count=3 rows=5'),
  ].join('\n'));
  expect(writes).toEqual([
    `${estimateLine}\n`,
    'IORI_ESTIMATE rows=0 upload_count=0 article_count=0 sample=insufficient capacity=ok\n',
    'IORI_ESTIMATE rows=9007199254740991 upload_count=1 article_count=1 sample=ok capacity=ok\n',
  ]);
});
it('relays the estimate line from a child process and keeps byte counts out of the public log', async () => {
  const writes = captureStderr();
  const directory = await createFixtureDirectory('iori-hosted-');
  try {
    const logs = join(directory, 'logs');
    await mkdir(logs, { mode: 0o700 });
    const script = join(directory, 'child.mjs');
    await writeFile(
      script,
      [
        `console.error(${JSON.stringify(estimateLine)});`,
        'console.error(\'table_bytes=10000 upload_bytes=8 source_free_bytes=10000000000\');',
        `console.error(${JSON.stringify(`${estimateLine} source_free_bytes=10000000000`)});`,
      ].join('\n'),
    );
    await executeHostedOperation(
      'estimate-source',
      script,
      { IORI_PRIVATE_LOG_DIRECTORY: logs },
      new AbortController().signal,
      60_000,
    );
    expect(writes).toEqual([`${estimateLine}\n`]);
    expect(writes.join('')).not.toContain('bytes');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
const runExitingChild = async (operation: string, exitCode: number) => {
  const directory = await createFixtureDirectory('iori-hosted-');
  try {
    const logs = join(directory, 'logs');
    await mkdir(logs, { mode: 0o700 });
    const script = join(directory, 'child.mjs');
    await writeFile(script, `process.exit(${exitCode});\n`);
    const result = await executeHostedOperation(
      'operation',
      script,
      { IORI_PRIVATE_LOG_DIRECTORY: logs },
      new AbortController().signal,
      60_000,
      operation,
    ).then(() => undefined, (error: unknown) => error);
    return result;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
const stoppedMessage =
  'Target preparation stopped before creating resources; fix the inputs and rerun with the same generation.';
const failedMessage = 'Protected workflow step failed; retain remote state for reviewed recovery.';
it('classifies a prepare-target child that exits with 78 as stopped before resources', async () => {
  const writes = captureStderr();
  const error = await runExitingChild('prepare-target', 78);
  expect(error).toBeInstanceOf(Error);
  expect(writes).toEqual([
    'IORI_DIAG stage=hosted-operation program=node exit=78 signal=none reason=stopped-before-resources\n',
  ]);
  expect(hostedFailureMessage(error)).toBe(stoppedMessage);
});
it('keeps command-failed for a prepare-target child that exits with 1', async () => {
  const writes = captureStderr();
  const error = await runExitingChild('prepare-target', 1);
  expect(writes).toEqual([
    'IORI_DIAG stage=hosted-operation program=node exit=1 signal=none reason=command-failed\n',
  ]);
  expect(hostedFailureMessage(error)).toBe(failedMessage);
});
it('keeps command-failed for another operation that exits with 78', async () => {
  const writes = captureStderr();
  const error = await runExitingChild('migrate-data', 78);
  expect(writes).toEqual([
    'IORI_DIAG stage=hosted-operation program=node exit=78 signal=none reason=command-failed\n',
  ]);
  expect(hostedFailureMessage(error)).toBe(failedMessage);
});
it('selects the stopped message only for the marked error and accepts both messages as workflow output', () => {
  expect(hostedFailureMessage(new Error('x'))).toBe(failedMessage);
  expect(hostedFailureMessage(undefined)).toBe(failedMessage);
  expect(assertWorkflowOutput(stoppedMessage)).toEqual([]);
  expect(assertWorkflowOutput(failedMessage)).toEqual([]);
  expect(preparationFailureReport(false).message).toBe(stoppedMessage);
});
it('reports the real prepare-migration-target CLI that stops before resources as stopped', async () => {
  const writes = captureStderr();
  const directory = await createFixtureDirectory('iori-hosted-');
  try {
    const logs = join(directory, 'logs');
    await mkdir(logs, { mode: 0o700 });
    const error = await executeHostedOperation(
      'operation',
      fileURLToPath(new URL('../prepare-migration-target.mjs', import.meta.url)),
      { IORI_PRIVATE_LOG_DIRECTORY: logs },
      new AbortController().signal,
      60_000,
      'prepare-target',
    ).then(() => undefined, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(writes).toEqual([
      'IORI_DIAG stage=hosted-operation program=node exit=78 signal=none reason=stopped-before-resources\n',
    ]);
    expect(hostedFailureMessage(error)).toBe(stoppedMessage);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
