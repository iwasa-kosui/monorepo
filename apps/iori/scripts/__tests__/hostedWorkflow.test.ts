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
it('maps the operations to their fixed scripts', async () => {
  const text = await readFile(new URL('../hosted-workflow.mjs', import.meta.url), 'utf8');
  for (
    const [name, script] of [
      ['deploy-worker', 'deploy-active-worker.mjs'],
      ['put-worker-secrets', 'worker-bindings-put.mjs'],
      ['resume-source', 'resume-source.mjs'],
      [
        'release-pending-freeze',
        'release-pending-freeze.mjs',
      ],
      ['restart-failed-source', 'restart-failed-source.mjs'],
      ['diagnose-source', 'diagnose-source.mjs'],
      ['delete-rehearsal-d1', 'delete-rehearsal-d1.mjs'],
      ['move-unfollowed-reposts-dry-run', 'move-unfollowed-reposts.mjs'],
      ['move-unfollowed-reposts', 'move-unfollowed-reposts.mjs'],
      ['prune-federated-posts-dry-run', 'prune-federated-posts.mjs'],
    ]
  ) {
    expect(text).toContain(`'${name}': '${script}',`);
    expect((await lstat(new URL(`../${script}`, import.meta.url))).isFile()).toBe(true);
  }
});
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
it('relays only the fixed rehearsal D1 notice for the five rehearsal names to the public log', async () => {
  const writes = captureStderr();
  const accepted = [1, 2, 3, 4, 5].flatMap(number =>
    ['present', 'absent', 'empty', 'not-empty', 'ambiguous', 'check-failed', 'deleted', 'delete-failed', 'remaining']
      .map(state => `IORI_NOTICE rehearsal-d1 name=iori-production-prdrehearse${number} state=${state}`)
  );
  const rejected = [
    'IORI_NOTICE rehearsal-d1 name=iori-production-prdrehearse6 state=present',
    'IORI_NOTICE rehearsal-d1 name=iori-production-prdrehearse0 state=present',
    'IORI_NOTICE rehearsal-d1 name=iori-production-prdrehearse1-x state=present',
    'IORI_NOTICE rehearsal-d1 name=iori-production-prd20261102a state=present',
    'IORI_NOTICE rehearsal-d1 name=iori state=present',
    'IORI_NOTICE rehearsal-d1 name=iori-production-prdrehearse1 state=unknown',
    'IORI_NOTICE rehearsal-d1 name=iori-production-prdrehearse1 state=present uuid=12345678-1234-4234-8234-123456789012',
    ' IORI_NOTICE rehearsal-d1 name=iori-production-prdrehearse1 state=present',
  ];
  await publishChildDiagnostics([...rejected, ...accepted].join('\n'));
  expect(writes).toEqual(accepted.map(line => `${line}\n`));
});
it('relays only the fixed move-unfollowed-reposts notices to the public log', async () => {
  const writes = captureStderr();
  const accepted = [
    'IORI_NOTICE move-unfollowed-reposts mode=dry-run targets=9400 posts=3000 already_federated=10 to_create=2990 missing_posts=5',
    'IORI_NOTICE move-unfollowed-reposts mode=dry-run targets=0 posts=0 already_federated=0 to_create=0 missing_posts=0',
    'IORI_NOTICE move-unfollowed-reposts mode=apply created=2990 deleted=9400',
  ];
  const rejected = [
    'IORI_NOTICE move-unfollowed-reposts mode=dry-run targets=1 posts=1 already_federated=1',
    'IORI_NOTICE move-unfollowed-reposts mode=dry-run targets=1 posts=1 already_federated=1 to_create=1',
    'IORI_NOTICE move-unfollowed-reposts mode=dry-run targets=-1 posts=1 already_federated=1 to_create=1 missing_posts=1',
    'IORI_NOTICE move-unfollowed-reposts mode=dry-run targets=1 posts=1 already_federated=1 to_create=1 missing_posts=1 extra=1',
    'IORI_NOTICE move-unfollowed-reposts mode=apply created=1 deleted=1 postId=12345678-1234-4234-8234-123456789012',
    'IORI_NOTICE move-unfollowed-reposts mode=apply created=1',
    'IORI_NOTICE move-unfollowed-reposts mode=delete created=1 deleted=1',
    'IORI_NOTICE move-unfollowed-reposts mode=apply created=1234567890 deleted=1',
    ' IORI_NOTICE move-unfollowed-reposts mode=apply created=1 deleted=1',
  ];
  await publishChildDiagnostics([...rejected, ...accepted].join('\n'));
  expect(writes).toEqual(accepted.map(line => `${line}\n`));
});
it('relays only the fixed prune-federated-posts dry-run notice to the public log', async () => {
  const writes = captureStderr();
  const head = 'IORI_NOTICE prune-federated-posts mode=dry-run';
  const reasons = 'local_likes=2 local_emoji=1 home=3 local_repost=0 reply=4 notification=5 article=6';
  const accepted = [
    `${head} candidates=12000 ${reasons} to_delete=11980 cutoff_ms=1799395200000`,
    `${head} candidates=0 local_likes=0 local_emoji=0 home=0 local_repost=0 reply=0 notification=0 article=0 to_delete=0 cutoff_ms=1799395200000`,
  ];
  const rejected = [
    `${head} candidates=1 ${reasons} to_delete=1`,
    `${head} candidates=1 ${reasons} cutoff_ms=1799395200000`,
    `${head} candidates=1 local_likes=0 local_emoji=0 home=0 local_repost=0 reply=0 notification=0 to_delete=1 cutoff_ms=1799395200000`,
    `${head} candidates=1 local_emoji=0 local_likes=0 home=0 local_repost=0 reply=0 notification=0 article=0 to_delete=1 cutoff_ms=1799395200000`,
    `${head} candidates=-1 ${reasons} to_delete=1 cutoff_ms=1799395200000`,
    `${head} candidates=1234567890 ${reasons} to_delete=1 cutoff_ms=1799395200000`,
    `${head} candidates=1 ${reasons} to_delete=1 cutoff_ms=0`,
    `${head} candidates=1 ${reasons} to_delete=1 cutoff_ms=01799395200000`,
    `${head} candidates=1 ${reasons} to_delete=1 cutoff_ms=17993952000000000`,
    `${head} candidates=1 ${reasons} to_delete=1 cutoff_ms=1799395200000 extra=1`,
    `${head} candidates=1 ${reasons} to_delete=1 cutoff_ms=1799395200000 postId=12345678-1234-4234-8234-123456789012`,
    `IORI_NOTICE prune-federated-posts mode=apply candidates=1 ${reasons} to_delete=1 cutoff_ms=1799395200000`,
    ` ${head} candidates=1 ${reasons} to_delete=1 cutoff_ms=1799395200000`,
  ];
  await publishChildDiagnostics([...rejected, ...accepted].join('\n'));
  expect(writes).toEqual(accepted.map(line => `${line}\n`));
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
const failedMessage = 'Protected workflow step failed; retain remote state for reviewed recovery.';
it('accepts the failure message as workflow output', () => {
  expect(hostedFailureMessage()).toBe(failedMessage);
  expect(assertWorkflowOutput(failedMessage)).toEqual([]);
});
it('relays the fixed-vocabulary operation detail and stage lines to the public log', async () => {
  const writes = captureStderr();
  const lines = [
    'IORI_DIAG stage=deploy-worker-before program=none exit=none signal=none reason=worker-route',
    'IORI_DIAG stage=deploy-worker-deploy program=none exit=none signal=none reason=deploy-failed',
    'IORI_DIAG stage=deploy-worker-after program=none exit=none signal=none reason=mismatch',
    'IORI_DIAG stage=unclassified program=none exit=none signal=none reason=unclassified',
  ];
  await publishChildDiagnostics([
    ...lines,
    'IORI_DIAG stage=deploy-worker-before program=none exit=none signal=none reason=worker_route',
    'IORI_DIAG stage=Deploy-worker-after program=none exit=none signal=none reason=mismatch',
  ].join('\n'));
  expect(writes).toEqual(lines.map(line => `${line}\n`));
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
    expect(hostedFailureMessage()).toBe(failedMessage);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
