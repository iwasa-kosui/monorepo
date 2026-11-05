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
  IORI_OPERATION: 'deploy-worker',
};
it('binds protected invocation to reviewed main and separates maintenance code from immutable migration SHA', () => {
  expect(parseWorkflowInvocation(env)).toMatchObject({ codeSha: env.MAIN_SHA, migrationSha: env.MAIN_SHA });
  expect(() => parseWorkflowInvocation({ ...env, GITHUB_REF: 'refs/heads/feature' })).toThrow();
  expect(() => parseWorkflowInvocation({ ...env, IORI_MIGRATION_RUN_ID: '../bad' })).toThrow();
  expect(parseWorkflowInvocation({ ...env, IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40) }))
    .toMatchObject({ migrationSha: 'b'.repeat(40), codeSha: env.MAIN_SHA });
  expect(() => parseWorkflowInvocation({ ...env, IORI_OPERATION: 'replace-queue-consumer' })).toThrow(
    'Maintenance operation requires a separate review.',
  );
});
it.each([
  'prepare-target',
  'estimate-source',
  'rehearse-migration',
  'purge-rehearsal-target',
  'migrate-data',
  'verify-import',
  'cutover-route',
  'adopt-cutover-state',
])('rejects the removed migration operation %s', operation => {
  expect(() => parseWorkflowInvocation({ ...env, IORI_OPERATION: operation })).toThrow(
    'Protected workflow invocation is invalid.',
  );
});
const frozenSha = 'b'.repeat(40);
const recoveryEnv = (operation: string, recovery?: string) => ({
  ...env,
  IORI_OPERATION: operation,
  IORI_MIGRATION_MAIN_SHA: frozenSha,
  ...(recovery === undefined ? {} : { IORI_RECOVERY: recovery }),
});
it.each(['destination_writes_not_enabled', 'destination_writes_reconciled'])(
  'accepts resume-source with recovery %s and a migration SHA different from the current main',
  (recovery) => {
    expect(parseWorkflowInvocation(recoveryEnv('resume-source', recovery))).toMatchObject({
      operation: 'resume-source',
      codeSha: env.MAIN_SHA,
      migrationSha: frozenSha,
      runId: env.IORI_MIGRATION_RUN_ID,
    });
  },
);
it.each([undefined, '', 'destination_writes_not_enabled ', 'Destination_writes_reconciled', 'reconciled', 'true'])(
  'rejects resume-source with recovery %j',
  (recovery) => {
    expect(() => parseWorkflowInvocation(recoveryEnv('resume-source', recovery))).toThrow(
      'Protected workflow invocation is invalid.',
    );
  },
);
it.each(['resume-source', 'release-pending-freeze', 'restart-failed-source'])(
  'requires a 40 digit hex migration SHA for %s',
  (operation) => {
    const recovery = operation === 'resume-source' ? 'destination_writes_reconciled' : undefined;
    const valid = recoveryEnv(operation, recovery);
    expect(parseWorkflowInvocation(valid)).toMatchObject({ migrationSha: frozenSha });
    for (const sha of [undefined, '', 'b'.repeat(39), 'B'.repeat(40), `${'b'.repeat(39)}g`, `${frozenSha}0`]) {
      expect(() => parseWorkflowInvocation({ ...valid, IORI_MIGRATION_MAIN_SHA: sha })).toThrow();
    }
  },
);
it('accepts release-pending-freeze only without recovery and with a different migration SHA', () => {
  expect(parseWorkflowInvocation(recoveryEnv('release-pending-freeze'))).toMatchObject({
    operation: 'release-pending-freeze',
    codeSha: env.MAIN_SHA,
    migrationSha: frozenSha,
  });
  expect(parseWorkflowInvocation(recoveryEnv('release-pending-freeze', ''))).toMatchObject({ migrationSha: frozenSha });
  for (const recovery of ['destination_writes_not_enabled', 'destination_writes_reconciled', 'x']) {
    expect(() => parseWorkflowInvocation(recoveryEnv('release-pending-freeze', recovery))).toThrow(
      'Protected workflow invocation is invalid.',
    );
  }
});
it.each(['resume-source', 'release-pending-freeze', 'restart-failed-source'])(
  'keeps the common checks for %s',
  (operation) => {
    const valid = recoveryEnv(operation, operation === 'resume-source' ? 'destination_writes_reconciled' : undefined);
    expect(() => parseWorkflowInvocation({ ...valid, GITHUB_REF: 'refs/heads/feature' })).toThrow();
    expect(() => parseWorkflowInvocation({ ...valid, GITHUB_EVENT_NAME: 'push' })).toThrow();
    expect(() => parseWorkflowInvocation({ ...valid, IORI_MIGRATION_RUN_ID: '../bad' })).toThrow();
    expect(() => parseWorkflowInvocation({ ...valid, IORI_MIGRATION_RUN_ID: '' })).toThrow();
    expect(() => parseWorkflowInvocation({ ...valid, IORI_ENVIRONMENT: 'development' })).toThrow();
  },
);
it('accepts restart-failed-source only without recovery and with a different migration SHA', () => {
  expect(parseWorkflowInvocation(recoveryEnv('restart-failed-source'))).toMatchObject({
    operation: 'restart-failed-source',
    codeSha: env.MAIN_SHA,
    migrationSha: frozenSha,
  });
  expect(parseWorkflowInvocation(recoveryEnv('restart-failed-source', ''))).toMatchObject({ migrationSha: frozenSha });
  for (const recovery of ['destination_writes_not_enabled', 'destination_writes_reconciled', 'x']) {
    expect(() => parseWorkflowInvocation(recoveryEnv('restart-failed-source', recovery))).toThrow(
      'Protected workflow invocation is invalid.',
    );
  }
});
it.each(['deploy-worker', 'put-worker-secrets'])(
  'rejects a non-empty IORI_RECOVERY for %s',
  (operation) => {
    const valid = { ...env, IORI_OPERATION: operation };
    expect(parseWorkflowInvocation(valid)).toMatchObject({ operation });
    expect(parseWorkflowInvocation({ ...valid, IORI_RECOVERY: '' })).toMatchObject({ operation });
    for (const recovery of ['destination_writes_not_enabled', 'destination_writes_reconciled', 'x']) {
      expect(() => parseWorkflowInvocation({ ...valid, IORI_RECOVERY: recovery })).toThrow(
        'Protected workflow invocation is invalid.',
      );
    }
  },
);
it.each(['diagnose-source'])(
  'still requires the code SHA and migration SHA to match for %s',
  operation => {
    const invocation = { ...env, IORI_GENERATION: '', IORI_MIGRATION_RUN_ID: '', IORI_OPERATION: operation };
    expect(parseWorkflowInvocation(invocation)).toMatchObject({ operation });
    expect(() => parseWorkflowInvocation({ ...invocation, IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40) })).toThrow(
      'Protected workflow invocation is invalid.',
    );
  },
);
it.each([
  ['diagnose-source', undefined],
  ['diagnose-source', ''],
])('accepts %s only without generation and run ID (%s)', (operation, empty) => {
  const diagnose = { ...env, IORI_OPERATION: operation, IORI_GENERATION: empty, IORI_MIGRATION_RUN_ID: empty };
  expect(parseWorkflowInvocation(diagnose)).toMatchObject({
    operation,
    codeSha: env.MAIN_SHA,
    migrationSha: env.MAIN_SHA,
  });
  expect(() => parseWorkflowInvocation({ ...diagnose, IORI_GENERATION: env.IORI_GENERATION })).toThrow(
    'Protected workflow invocation is invalid.',
  );
  expect(() => parseWorkflowInvocation({ ...diagnose, IORI_MIGRATION_RUN_ID: env.IORI_MIGRATION_RUN_ID })).toThrow(
    'Protected workflow invocation is invalid.',
  );
  expect(() =>
    parseWorkflowInvocation({
      ...diagnose,
      IORI_GENERATION: env.IORI_GENERATION,
      IORI_MIGRATION_RUN_ID: env.IORI_MIGRATION_RUN_ID,
    })
  ).toThrow('Protected workflow invocation is invalid.');
  expect(() => parseWorkflowInvocation({ ...diagnose, IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40) })).toThrow();
  expect(() => parseWorkflowInvocation({ ...diagnose, GITHUB_REF: 'refs/heads/feature' })).toThrow();
});
it('rejects diagnose-source with a recovery value, a stale main SHA or an unknown environment', () => {
  const diagnose = { ...env, IORI_OPERATION: 'diagnose-source', IORI_GENERATION: '', IORI_MIGRATION_RUN_ID: '' };
  expect(() => parseWorkflowInvocation({ ...diagnose, IORI_RECOVERY: 'destination_writes_reconciled' })).toThrow(
    'Protected workflow invocation is invalid.',
  );
  expect(() => parseWorkflowInvocation({ ...diagnose, GITHUB_SHA: 'b'.repeat(40) })).toThrow(
    'Protected workflow invocation is invalid.',
  );
  expect(() => parseWorkflowInvocation({ ...diagnose, IORI_ENVIRONMENT: 'development' })).toThrow(
    'Protected workflow invocation is invalid.',
  );
});
it.each(['deploy-worker', 'put-worker-secrets'])(
  'rejects an empty or missing generation and run ID for %s',
  operation => {
    const invocation = { ...env, IORI_OPERATION: operation };
    expect(parseWorkflowInvocation(invocation)).toMatchObject({ operation });
    for (const key of ['IORI_GENERATION', 'IORI_MIGRATION_RUN_ID'] as const) {
      for (const empty of ['', undefined]) {
        expect(() => parseWorkflowInvocation({ ...invocation, [key]: empty })).toThrow(
          'Protected workflow invocation is invalid.',
        );
      }
    }
  },
);
const rehearsalDelete = {
  ...env,
  IORI_ENVIRONMENT: 'production',
  IORI_OPERATION: 'delete-rehearsal-d1',
  IORI_GENERATION: '',
  IORI_MIGRATION_RUN_ID: '',
};
it('accepts delete-rehearsal-d1 only for production without generation and run ID', () => {
  expect(parseWorkflowInvocation(rehearsalDelete)).toMatchObject({
    operation: 'delete-rehearsal-d1',
    codeSha: env.MAIN_SHA,
    migrationSha: env.MAIN_SHA,
    environment: 'production',
  });
  expect(parseWorkflowInvocation({ ...rehearsalDelete, IORI_MIGRATION_MAIN_SHA: '' })).toMatchObject({
    migrationSha: env.MAIN_SHA,
  });
  expect(parseWorkflowInvocation({ ...rehearsalDelete, IORI_GENERATION: undefined, IORI_MIGRATION_RUN_ID: undefined }))
    .toMatchObject({ operation: 'delete-rehearsal-d1' });
  const invalid = [
    { IORI_ENVIRONMENT: 'staging' },
    { IORI_ENVIRONMENT: 'development' },
    { IORI_GENERATION: env.IORI_GENERATION },
    { IORI_MIGRATION_RUN_ID: env.IORI_MIGRATION_RUN_ID },
    { IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40) },
    { IORI_RECOVERY: 'destination_writes_reconciled' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_SHA: 'b'.repeat(40) },
    { GITHUB_EVENT_NAME: 'push' },
  ];
  for (const given of invalid) {
    expect(() => parseWorkflowInvocation({ ...rehearsalDelete, ...given })).toThrow(
      'Protected workflow invocation is invalid.',
    );
  }
});
const moveOperations = ['move-unfollowed-reposts-dry-run', 'move-unfollowed-reposts'];
const moveReposts = (operation: string) => ({
  ...env,
  IORI_ENVIRONMENT: 'production',
  IORI_GENERATION: 'prd20261102a',
  IORI_OPERATION: operation,
  IORI_MIGRATION_RUN_ID: '',
  IORI_REPOST_CREATED_BEFORE_MS: '1700000000000',
});
it.each(moveOperations)(
  'accepts %s only for production with a generation, a past time limit and no run ID',
  operation => {
    expect(parseWorkflowInvocation(moveReposts(operation))).toMatchObject({
      operation,
      codeSha: env.MAIN_SHA,
      environment: 'production',
      generation: 'prd20261102a',
    });
    const invalid = [
      { IORI_ENVIRONMENT: 'staging' },
      { IORI_GENERATION: '' },
      { IORI_GENERATION: 'Bad-Generation' },
      { IORI_MIGRATION_RUN_ID: 'fixture' },
      { IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40) },
      { IORI_RECOVERY: 'destination_writes_reconciled' },
      { IORI_REPOST_CREATED_BEFORE_MS: '' },
      { IORI_REPOST_CREATED_BEFORE_MS: undefined },
      { IORI_REPOST_CREATED_BEFORE_MS: 'abc' },
      { IORI_REPOST_CREATED_BEFORE_MS: '1.5' },
      { IORI_REPOST_CREATED_BEFORE_MS: '-1' },
      { IORI_REPOST_CREATED_BEFORE_MS: '0' },
      { IORI_REPOST_CREATED_BEFORE_MS: '01700000000000' },
      { IORI_REPOST_CREATED_BEFORE_MS: '1700000000000 ' },
      { IORI_REPOST_CREATED_BEFORE_MS: '99999999999999999' },
      { IORI_REPOST_CREATED_BEFORE_MS: String(Date.now() + 60_000) },
      { GITHUB_REF: 'refs/heads/feature' },
      { GITHUB_EVENT_NAME: 'push' },
    ];
    for (const given of invalid) {
      expect(() => parseWorkflowInvocation({ ...moveReposts(operation), ...given })).toThrow(
        'Protected workflow invocation is invalid.',
      );
    }
  },
);
const domainEventsStats = {
  ...env,
  IORI_ENVIRONMENT: 'production',
  IORI_GENERATION: 'prd20261102a',
  IORI_OPERATION: 'domain-events-stats',
  IORI_MIGRATION_RUN_ID: '',
};
it('accepts domain-events-stats only for production with a generation, no run ID and no repost time limit', () => {
  expect(parseWorkflowInvocation(domainEventsStats)).toMatchObject({
    operation: 'domain-events-stats',
    codeSha: env.MAIN_SHA,
    environment: 'production',
    generation: 'prd20261102a',
  });
  const invalid = [
    { IORI_ENVIRONMENT: 'staging' },
    { IORI_GENERATION: '' },
    { IORI_GENERATION: 'Bad-Generation' },
    { IORI_MIGRATION_RUN_ID: 'fixture' },
    { IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40) },
    { IORI_RECOVERY: 'destination_writes_reconciled' },
    { IORI_REPOST_CREATED_BEFORE_MS: '1700000000000' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_EVENT_NAME: 'push' },
  ];
  for (const given of invalid) {
    expect(() => parseWorkflowInvocation({ ...domainEventsStats, ...given })).toThrow(
      'Protected workflow invocation is invalid.',
    );
  }
});
it('compares the time limit with the given clock', () => {
  expect(parseWorkflowInvocation(moveReposts('move-unfollowed-reposts'), { now: 1_700_000_000_000 }))
    .toMatchObject({ operation: 'move-unfollowed-reposts' });
  expect(() => parseWorkflowInvocation(moveReposts('move-unfollowed-reposts'), { now: 1_699_999_999_999 })).toThrow(
    'Protected workflow invocation is invalid.',
  );
});
it.each(['deploy-worker', 'put-worker-secrets', 'diagnose-source', 'delete-rehearsal-d1', 'resume-source'])(
  'rejects the repost time limit for the operation %s',
  operation => {
    const base = operation === 'delete-rehearsal-d1'
      ? { ...env, IORI_ENVIRONMENT: 'production', IORI_GENERATION: '', IORI_MIGRATION_RUN_ID: '' }
      : operation === 'diagnose-source'
      ? { ...env, IORI_GENERATION: '', IORI_MIGRATION_RUN_ID: '' }
      : operation === 'resume-source'
      ? { ...env, IORI_RECOVERY: 'destination_writes_reconciled' }
      : env;
    expect(parseWorkflowInvocation({ ...base, IORI_OPERATION: operation })).toMatchObject({ operation });
    expect(() =>
      parseWorkflowInvocation({ ...base, IORI_OPERATION: operation, IORI_REPOST_CREATED_BEFORE_MS: '1700000000000' })
    ).toThrow('Protected workflow invocation is invalid.');
  },
);
const prunePosts = (overrides: Record<string, string | undefined> = {}) => ({
  ...env,
  IORI_ENVIRONMENT: 'production',
  IORI_GENERATION: 'prd20261102a',
  IORI_OPERATION: 'prune-federated-posts-dry-run',
  IORI_MIGRATION_RUN_ID: '',
  IORI_REPOST_CREATED_BEFORE_MS: '',
  ...overrides,
});
it('accepts prune-federated-posts-dry-run only for production with a generation and no other input', () => {
  expect(parseWorkflowInvocation(prunePosts())).toMatchObject({
    operation: 'prune-federated-posts-dry-run',
    codeSha: env.MAIN_SHA,
    environment: 'production',
    generation: 'prd20261102a',
  });
  expect(parseWorkflowInvocation(prunePosts({ IORI_REPOST_CREATED_BEFORE_MS: undefined }))).toMatchObject({
    operation: 'prune-federated-posts-dry-run',
  });
  const invalid = [
    { IORI_ENVIRONMENT: 'staging' },
    { IORI_GENERATION: '' },
    { IORI_GENERATION: 'Bad-Generation' },
    { IORI_MIGRATION_RUN_ID: 'fixture' },
    { IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40) },
    { IORI_RECOVERY: 'destination_writes_reconciled' },
    { IORI_REPOST_CREATED_BEFORE_MS: '1700000000000' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_EVENT_NAME: 'push' },
  ];
  for (const given of invalid) {
    expect(() => parseWorkflowInvocation(prunePosts(given))).toThrow('Protected workflow invocation is invalid.');
  }
});
const ensureBucket = (overrides: Record<string, string | undefined> = {}) => ({
  ...env,
  IORI_ENVIRONMENT: 'production',
  IORI_GENERATION: 'prd20261102a',
  IORI_OPERATION: 'ensure-event-archive-bucket',
  IORI_MIGRATION_RUN_ID: '',
  IORI_REPOST_CREATED_BEFORE_MS: '',
  ...overrides,
});
it('accepts ensure-event-archive-bucket for production and staging with a generation and no other input', () => {
  for (const environment of ['production', 'staging']) {
    expect(parseWorkflowInvocation(ensureBucket({ IORI_ENVIRONMENT: environment }))).toMatchObject({
      operation: 'ensure-event-archive-bucket',
      codeSha: env.MAIN_SHA,
      environment,
      generation: 'prd20261102a',
    });
  }
  const invalid = [
    { IORI_ENVIRONMENT: 'development' },
    { IORI_GENERATION: '' },
    { IORI_GENERATION: 'Bad-Generation' },
    { IORI_MIGRATION_RUN_ID: 'fixture' },
    { IORI_MIGRATION_MAIN_SHA: 'b'.repeat(40) },
    { IORI_RECOVERY: 'destination_writes_reconciled' },
    { IORI_REPOST_CREATED_BEFORE_MS: '1700000000000' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_EVENT_NAME: 'push' },
  ];
  for (const given of invalid) {
    expect(() => parseWorkflowInvocation(ensureBucket(given))).toThrow('Protected workflow invocation is invalid.');
  }
});
const pushIdentity = {
  environment: 'production',
  generation: 'prd20261102a',
  mainSha: 'c'.repeat(40),
  runId: 'prd20261102a-20261102a',
  hostname: 'iori.example.invalid',
  workerHostname: 'iori-production-prd20261102a.example.workers.dev',
  smoke: { username: 'smoke', uploadFilename: 'x.png', articleId: 'y' },
};
const pushEnv = {
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: 'a'.repeat(40),
  MAIN_SHA: 'a'.repeat(40),
  IORI_ENVIRONMENT: 'production',
  IORI_OPERATION: 'deploy-worker',
  IORI_ADMISSION_IDENTITY: JSON.stringify(pushIdentity),
};
it('builds the deploy-worker inputs of a main push from the admission identity', () => {
  expect(parseWorkflowInvocation(pushEnv)).toEqual({
    operation: 'deploy-worker',
    codeSha: 'a'.repeat(40),
    migrationSha: 'c'.repeat(40),
    environment: 'production',
    generation: 'prd20261102a',
    runId: 'prd20261102a-20261102a',
  });
  expect(parseWorkflowInvocation({
    ...pushEnv,
    IORI_GENERATION: 'prd20261102a',
    IORI_MIGRATION_RUN_ID: 'prd20261102a-20261102a',
    IORI_MIGRATION_MAIN_SHA: 'c'.repeat(40),
  })).toMatchObject({ generation: 'prd20261102a' });
});
it('checks only the event, ref, SHA and operation of a push while the identity is deferred', () => {
  const { IORI_ADMISSION_IDENTITY: _identity, ...withoutIdentity } = pushEnv;
  expect(parseWorkflowInvocation(withoutIdentity, { deferIdentity: true })).toMatchObject({
    operation: 'deploy-worker',
    codeSha: 'a'.repeat(40),
  });
  expect(() => parseWorkflowInvocation(withoutIdentity)).toThrow('Protected workflow invocation is invalid.');
  expect(() =>
    parseWorkflowInvocation({ ...withoutIdentity, IORI_OPERATION: 'put-worker-secrets' }, { deferIdentity: true })
  )
    .toThrow('Protected workflow invocation is invalid.');
});
it.each(['put-worker-secrets', 'delete-rehearsal-d1', 'resume-source', 'source', ''])(
  'rejects a main push for the operation %j',
  operation => {
    expect(() => parseWorkflowInvocation({ ...pushEnv, IORI_OPERATION: operation })).toThrow(
      'Protected workflow invocation is invalid.',
    );
  },
);
it('rejects a push with a wrong ref, SHA, environment, recovery value or conflicting inputs', () => {
  const invalid = [
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_SHA: 'b'.repeat(40) },
    { MAIN_SHA: '' },
    { IORI_ENVIRONMENT: 'staging' },
    { IORI_ENVIRONMENT: '' },
    { IORI_RECOVERY: 'destination_writes_reconciled' },
    { IORI_GENERATION: 'other2026110' },
    { IORI_MIGRATION_RUN_ID: 'other' },
    { IORI_MIGRATION_MAIN_SHA: 'd'.repeat(40) },
  ];
  for (const given of invalid) {
    expect(() => parseWorkflowInvocation({ ...pushEnv, ...given })).toThrow(
      'Protected workflow invocation is invalid.',
    );
  }
  expect(() => parseWorkflowInvocation({ ...pushEnv, IORI_OPERATION: 'replace-queue-consumer' })).toThrow(
    'Maintenance operation requires a separate review.',
  );
});
it('rejects a push when the admission identity is missing, malformed or not for production', () => {
  const identities = [
    undefined,
    '',
    'not json',
    'null',
    '[]',
    JSON.stringify({ ...pushIdentity, environment: 'staging' }),
    JSON.stringify({ ...pushIdentity, generation: 'Upper_Case' }),
    JSON.stringify({ ...pushIdentity, generation: undefined }),
    JSON.stringify({ ...pushIdentity, runId: '../bad' }),
    JSON.stringify({ ...pushIdentity, runId: undefined }),
    JSON.stringify({ ...pushIdentity, mainSha: 'c'.repeat(39) }),
    JSON.stringify({ ...pushIdentity, mainSha: undefined }),
  ];
  for (const identity of identities) {
    expect(() => parseWorkflowInvocation({ ...pushEnv, IORI_ADMISSION_IDENTITY: identity })).toThrow(
      'Protected workflow invocation is invalid.',
    );
  }
});
it('keeps rejecting the push event for every dispatch-only route even with an admission identity', () => {
  for (const operation of ['resume-source']) {
    expect(() => parseWorkflowInvocation({ ...env, IORI_OPERATION: operation, GITHUB_EVENT_NAME: 'push' })).toThrow(
      'Protected workflow invocation is invalid.',
    );
  }
  expect(() =>
    parseWorkflowInvocation({
      ...env,
      IORI_OPERATION: 'deploy-worker',
      GITHUB_EVENT_NAME: 'schedule',
      IORI_ADMISSION_IDENTITY: pushEnv.IORI_ADMISSION_IDENTITY,
    })
  ).toThrow('Protected workflow invocation is invalid.');
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
