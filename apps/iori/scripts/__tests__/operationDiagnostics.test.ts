import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
import { deployReviewedWorkerVersion } from '../deploy-reviewed-worker-version.mjs';
import { createTargetIdentity } from '../fresh-target.mjs';
import { targetIdentity } from '../migration-target-contract.mjs';
import { OPERATION_STAGES, operationFailureLines } from '../operation-diagnostics.mjs';
import { readSealedMigrationTarget } from '../read-sealed-migration-target.mjs';
import { createSourceSshAdapter } from '../source-control-ssh.mjs';
import { createTargetControlPlane } from '../target-control-plane.mjs';
import { createFixtureDirectory } from './fixtureTemp.ts';
import { expectedTargetFixture, preparationFixture } from './migrationTargetFixture.js';

const mocks = vi.hoisted(() => ({ config: vi.fn() }));
vi.mock('../temporary-worker-config.mjs', () => ({ createDeploymentWorkerConfig: mocks.config }));

const publicLine =
  /^IORI_DIAG stage=[a-z-]{1,24} program=(?:ssh|rsync|node|none) exit=(?:\d{1,3}|none) signal=(?:[A-Z0-9]{1,12}|none) reason=[a-z0-9-]{1,40}$/;
const operationLine = (stage: string, reason: string) =>
  `IORI_DIAG stage=${stage} program=none exit=none signal=none reason=${reason}`;
const operationFailure = (reason?: string, details?: unknown, message = 'fixture-secret-message') =>
  Object.assign(
    new Error(message),
    reason === undefined && details === undefined
      ? {}
      : { diagnostic: { ...(reason === undefined ? {} : { reason }), ...(details === undefined ? {} : { details }) } },
  );
it('pins the operation stage vocabulary', () => {
  expect(OPERATION_STAGES).toEqual([
    'verify-import',
    'rehearse-migration',
    'migrate-data',
    'deploy-worker-before',
    'deploy-worker-migrate',
    'deploy-worker-deploy',
    'deploy-worker-after',
  ]);
  expect(Object.isFrozen(OPERATION_STAGES)).toBe(true);
});
it('keeps every operation stage line within the public relay pattern and the workflow output check', () => {
  for (const stage of [...OPERATION_STAGES, 'unclassified']) {
    const [line] = operationFailureLines(stage, operationFailure('state-mismatch'));
    expect(line).toBe(operationLine(stage, 'state-mismatch'));
    expect(line).toMatch(publicLine);
    expect(assertWorkflowOutput(line!)).toEqual([]);
  }
});
it('prints the allowed details first and the classification last', () => {
  const lines = operationFailureLines(
    'verify-import',
    operationFailure('state-mismatch', ['resource-consumer-script', 'resource-d1']),
  );
  expect(lines).toEqual([
    operationLine('verify-import', 'resource-consumer-script'),
    operationLine('verify-import', 'resource-d1'),
    operationLine('verify-import', 'state-mismatch'),
  ]);
  expect(lines.join('\n')).not.toContain('fixture-secret-message');
});
it('removes duplicate details and keeps at most eight', () => {
  const details = [
    'resource-d1',
    'resource-d1',
    'resource-kv',
    'resource-r2',
    'resource-queue-identity',
    'resource-queue-paused',
    'resource-queue-shape',
    'resource-queue-created',
    'resource-dlq-attached',
    'resource-consumer-count',
  ];
  const lines = operationFailureLines('migrate-data', operationFailure('state-mismatch', details));
  expect(lines).toHaveLength(9);
  expect(lines.slice(0, 8).map(line => line.split('reason=')[1])).toEqual([
    'resource-d1',
    'resource-kv',
    'resource-r2',
    'resource-queue-identity',
    'resource-queue-paused',
    'resource-queue-shape',
    'resource-queue-created',
    'resource-dlq-attached',
  ]);
  expect(lines[8]).toBe(operationLine('migrate-data', 'state-mismatch'));
});
it('drops details outside the allowed vocabulary', () => {
  const lines = operationFailureLines(
    'migrate-data',
    operationFailure('mismatch', ['https://secret.invalid', 'Resource D1', 7, null, 'resource-d1']),
  );
  expect(lines).toEqual([operationLine('migrate-data', 'resource-d1'), operationLine('migrate-data', 'mismatch')]);
  expect(operationFailureLines('migrate-data', operationFailure('mismatch', 'resource-d1'))).toEqual([
    operationLine('migrate-data', 'mismatch'),
  ]);
});
it('classifies by diagnostic reason, then abort names, then unclassified', () => {
  expect(operationFailureLines('rehearse-migration', operationFailure('plan-rejected'))).toEqual([
    operationLine('rehearse-migration', 'plan-rejected'),
  ]);
  expect(operationFailureLines('rehearse-migration', operationFailure('https://secret.invalid'))).toEqual([
    operationLine('rehearse-migration', 'unclassified'),
  ]);
  for (const name of ['AbortError', 'TimeoutError']) {
    expect(operationFailureLines('rehearse-migration', Object.assign(new Error('x'), { name }))).toEqual([
      operationLine('rehearse-migration', 'aborted'),
    ]);
  }
  expect(operationFailureLines('rehearse-migration', new Error('x'))).toEqual([
    operationLine('rehearse-migration', 'unclassified'),
  ]);
  expect(operationFailureLines('rehearse-migration', undefined)).toEqual([
    operationLine('rehearse-migration', 'unclassified'),
  ]);
  expect(operationFailureLines('rehearse-migration', 'text')).toEqual([
    operationLine('rehearse-migration', 'unclassified'),
  ]);
});
it('uses stage=unclassified for a stage outside the vocabulary', () => {
  for (const stage of ['unknown', undefined, 'prepare-inputs', 'https://secret.invalid']) {
    expect(operationFailureLines(stage, operationFailure('mismatch'))).toEqual([
      operationLine('unclassified', 'mismatch'),
    ]);
  }
});
it('reads the first inner error of an AggregateError that has no diagnostic', () => {
  const inner = operationFailure('state-mismatch', ['resource-consumer-script']);
  const aggregate = new AggregateError([inner, new Error('resume')], 'fixture-secret-message');
  expect(operationFailureLines('rehearse-migration', aggregate)).toEqual([
    operationLine('rehearse-migration', 'resource-consumer-script'),
    operationLine('rehearse-migration', 'state-mismatch'),
  ]);
  const aborted = new AggregateError([Object.assign(new Error('x'), { name: 'AbortError' })], 'x');
  expect(operationFailureLines('rehearse-migration', aborted)).toEqual([
    operationLine('rehearse-migration', 'aborted'),
  ]);
  expect(operationFailureLines('rehearse-migration', new AggregateError([], 'x'))).toEqual([
    operationLine('rehearse-migration', 'unclassified'),
  ]);
  const own = Object.assign(new AggregateError([inner], 'x'), { diagnostic: { reason: 'mismatch' } });
  expect(operationFailureLines('rehearse-migration', own)).toEqual([operationLine('rehearse-migration', 'mismatch')]);
});
const sshOptions = async () => {
  const root = await createFixtureDirectory('iori-operation-ssh-');
  const identityFile = join(root, 'fixture.key');
  const knownHostsFile = join(root, 'known_hosts');
  await writeFile(identityFile, 'synthetic-not-a-key', { mode: 0o600 });
  await writeFile(knownHostsFile, 'synthetic', { mode: 0o600 });
  return {
    host: 'source.example.invalid',
    user: 'fixture',
    mainSha: 'a'.repeat(40),
    runId: '123',
    identityFile,
    knownHostsFile,
  };
};
const exitingSpawn = (code: number, stdout = '') => () => {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: () => true,
  });
  queueMicrotask(() => {
    child.stdout.end(stdout);
    child.stderr.end('PRIVATE SHOULD NOT ESCAPE');
    child.emit('close', code);
  });
  return child;
};
it.each([
  [75, 'not-ready'],
  [76, 'busy'],
  [255, 'ssh-failed'],
  [1, 'ssh-failed'],
])('prints the source word of a real adapter failure that ends with exit code %d', async (code, reason) => {
  const adapter = await createSourceSshAdapter(await sshOptions(), { spawnProcess: exitingSpawn(code) as never });
  const failure = await adapter.freeze().catch((error: unknown) => error);
  expect(operationFailureLines('migrate-data', failure)).toEqual([operationLine('migrate-data', reason)]);
});
it.each([
  ['{"ok":false,"error":"control_rejected"}\n', 'rejected'],
  ['{"ok":false,"error":"control_rejected","detail":"estimate-query"}\n', 'estimate-query'],
])('prints the source word of a real adapter rejection %j', async (stdout, reason) => {
  const adapter = await createSourceSshAdapter(await sshOptions(), {
    spawnProcess: exitingSpawn(1, stdout) as never,
  });
  const failure = await adapter.freeze().catch((error: unknown) => error);
  expect(operationFailureLines('migrate-data', failure)).toEqual([operationLine('migrate-data', reason)]);
});
const identity = createTargetIdentity({
  environment: 'staging',
  generation: 'fixture1',
  accountId: 'a'.repeat(32),
  backendBucket: 'tf-state',
});
const queueResponse = (id: string, name: string, consumers: unknown[]) => ({
  queue_id: id,
  queue_name: name,
  created_on: '2026-09-05T00:00:00Z',
  settings: { delivery_paused: true },
  consumers,
  producers: [],
  consumers_total_count: consumers.length,
  producers_total_count: 0,
});
it('prints the consumer script detail and state-mismatch of a real readResources failure', async () => {
  const consumer = {
    type: 'worker',
    script: 'old-worker',
    dead_letter_queue: identity.names.dlq,
    consumer_id: 'consumer-id',
    settings: { batch_size: 1, max_wait_time_ms: 1000, max_retries: 3, retry_delay: 30 },
  };
  const responses: Record<string, unknown> = {
    '/d1/database/db-id': { uuid: 'db-id', name: identity.names.d1 },
    '/storage/kv/namespaces/kv-id': { id: 'kv-id', title: identity.names.kv },
    [`/r2/buckets/${identity.names.uploads}`]: { name: identity.names.uploads },
    [`/r2/buckets/${identity.names.transfer}`]: { name: identity.names.transfer },
    [`/r2/buckets/${identity.names.transfer}/domains/managed`]: { enabled: false },
    '/queues/queue-id': queueResponse('queue-id', identity.names.queue, [consumer]),
    '/queues/dlq-id': queueResponse('dlq-id', identity.names.dlq, []),
  };
  const api = createTargetControlPlane({
    identity,
    token: 'private-token',
    fetchRequest: async (url: URL) => {
      const result = responses[url.pathname.replace(`/client/v4/accounts/${identity.accountId}`, '')];
      return Response.json(result === undefined ? { success: false } : { success: true, result });
    },
  });
  const failure = await api.readResources({
    d1Id: 'db-id',
    kvId: 'kv-id',
    queueId: 'queue-id',
    dlqId: 'dlq-id',
    consumerAttached: true,
  }).catch((error: unknown) => error);
  expect(operationFailureLines('verify-import', failure)).toEqual([
    operationLine('verify-import', 'resource-consumer-script'),
    operationLine('verify-import', 'state-mismatch'),
  ]);
});
it('prints deploy-failed for a real deployment that the command reports as failed', async () => {
  const admissionEnvironment = {
    IORI_ADMISSION_MODE: 'active',
    IORI_ADMISSION_IDENTITY: 'fixture-identity',
    ORIGIN: 'https://staging.test',
  };
  const path = join(await mkdtemp(join(tmpdir(), 'operation-deploy-')), 'wrangler.json');
  await writeFile(
    path,
    JSON.stringify({
      name: identity.workerName,
      vars: admissionEnvironment,
      d1_databases: [{ database_id: 'db' }],
      kv_namespaces: [{ id: 'kv' }],
      r2_buckets: [{ bucket_name: identity.names.uploads }],
      queues: { producers: [{ queue: identity.names.queue }] },
    }),
  );
  mocks.config.mockResolvedValue({ path, cleanup: vi.fn() });
  const runCommand = vi.fn(async () => ({ status: 1, stdout: 'private diagnostic', stderr: '' }));
  const failure = await deployReviewedWorkerVersion({
    identity,
    resources: { d1Id: 'db', kvId: 'kv', queueId: 'queue' } as never,
    admissionEnvironment,
    mode: 'active',
    signal: new AbortController().signal,
    runCommand: runCommand as never,
  }).catch((error: unknown) => error);
  expect(runCommand).toHaveBeenCalledTimes(1);
  expect(operationFailureLines('deploy-worker-deploy', failure)).toEqual([
    operationLine('deploy-worker-deploy', 'deploy-failed'),
  ]);
});
describe('a real deployment with D1 migrations', () => {
  const admissionEnvironment = {
    IORI_ADMISSION_MODE: 'active',
    IORI_ADMISSION_IDENTITY: 'fixture-identity',
    ORIGIN: 'https://staging.test',
  };
  const deployInput = async (runCommand: unknown, onStage: (stage: string) => void) => {
    const path = join(await mkdtemp(join(tmpdir(), 'operation-d1-migrate-')), 'wrangler.json');
    await writeFile(
      path,
      JSON.stringify({
        name: identity.workerName,
        vars: admissionEnvironment,
        d1_databases: [{ binding: 'DB', database_id: 'db' }],
        kv_namespaces: [{ id: 'kv' }],
        r2_buckets: [{ bucket_name: identity.names.uploads }],
        queues: { producers: [{ queue: identity.names.queue }] },
      }),
    );
    mocks.config.mockResolvedValue({ path, cleanup: vi.fn() });
    return {
      path,
      input: {
        identity,
        resources: { d1Id: 'db', kvId: 'kv', queueId: 'queue' } as never,
        admissionEnvironment,
        mode: 'active' as const,
        signal: new AbortController().signal,
        runCommand: runCommand as never,
        migrateD1: true,
        onStage,
      },
    };
  };
  it('applies the D1 migrations to the binding before it deploys with the same config', async () => {
    const calls: string[][] = [];
    const runCommand = vi.fn(async (_program: string, args: string[], options: { env: Record<string, string> }) => {
      calls.push(args);
      if (args[2] === 'deploy') {
        await writeFile(
          options.env.WRANGLER_OUTPUT_FILE_PATH!,
          `${JSON.stringify({ type: 'deploy', version: 1, worker_name: identity.workerName, version_id: 'next' })}\n`,
        );
      }
      return { status: 0, stdout: '', stderr: '' };
    });
    const stages: string[] = [];
    const { path, input } = await deployInput(runCommand, (stage) => stages.push(stage));
    await expect(deployReviewedWorkerVersion(input)).resolves.toBe('next');
    expect(calls).toEqual([
      ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', path],
      ['exec', 'wrangler', 'deploy', '--config', path, '--minify'],
    ]);
    expect(stages).toEqual(['deploy-worker-migrate', 'deploy-worker-deploy']);
  });
  it.each([
    ['reports a failed exit status', async () => ({ status: 1, stdout: 'private diagnostic', stderr: '' })],
    ['rejects', async () => Promise.reject(new Error('Migration command failed; outcome may be uncertain.'))],
  ])('does not deploy and prints command-failed at deploy-worker-migrate when the migration %s', async (_name, run) => {
    const runCommand = vi.fn(run);
    const stages: string[] = [];
    const { input } = await deployInput(runCommand, (stage) => stages.push(stage));
    const failure = await deployReviewedWorkerVersion(input).catch((error: unknown) => error);
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(stages).toEqual(['deploy-worker-migrate']);
    expect(operationFailureLines(stages.at(-1)!, failure)).toEqual([
      operationLine('deploy-worker-migrate', 'command-failed'),
    ]);
  });
});
it('prints config-invalid for the configuration messages of the four operation scripts', () => {
  for (
    const message of [
      'Independent expected target is required.',
      'Protected workflow invocation is invalid.',
      'Executor configuration is required.',
      'Invalid zone.',
    ]
  ) {
    expect(operationFailureLines('migrate-data', new Error(message))).toEqual([
      operationLine('migrate-data', 'config-invalid'),
    ]);
  }
});
describe('a real readSealedMigrationTarget failure', () => {
  const target = expectedTargetFixture();
  const sealedIdentity = targetIdentity(target);
  const readbackResponses = (consumerId: string): Record<string, unknown> => ({
    '/d1/database/db': { uuid: 'db', name: sealedIdentity.names.d1 },
    '/storage/kv/namespaces/kv': { id: 'kv', title: sealedIdentity.names.kv },
    [`/r2/buckets/${sealedIdentity.names.uploads}`]: { name: sealedIdentity.names.uploads },
    [`/r2/buckets/${sealedIdentity.names.transfer}`]: { name: sealedIdentity.names.transfer },
    [`/r2/buckets/${sealedIdentity.names.transfer}/domains/managed`]: { enabled: false },
    '/queues/queue': queueResponse('queue', sealedIdentity.names.queue, [{
      type: 'worker',
      script: sealedIdentity.workerName,
      dead_letter_queue: sealedIdentity.names.dlq,
      consumer_id: consumerId,
      settings: { batch_size: 1, max_wait_time_ms: 1000, max_retries: 3, retry_delay: 30 },
    }]),
    '/queues/dlq': queueResponse('dlq', sealedIdentity.names.dlq, []),
  });
  const read = (record: unknown, consumerId = 'consumer') =>
    readSealedMigrationTarget({
      expectedTarget: target,
      record,
      token: 'private-token',
      zoneId: 'b'.repeat(32),
      fetchRequest: (async (url: URL) => {
        const result = readbackResponses(consumerId)[
          url.pathname.replace(`/client/v4/accounts/${sealedIdentity.accountId}`, '')
        ];
        return Response.json(result === undefined ? { success: false } : { success: true, result });
      }) as never,
    }).catch((error: unknown) => error);
  it('prints resource-consumer-id and state-mismatch for a consumer id that differs from the record', async () => {
    const failure = await read(preparationFixture(), 'other-consumer');
    expect(failure).toHaveProperty('message', 'Prepared consumer mismatch.');
    expect(operationFailureLines('verify-import', failure)).toEqual([
      operationLine('verify-import', 'resource-consumer-id'),
      operationLine('verify-import', 'state-mismatch'),
    ]);
  });
  it('prints identity-mismatch for a record that differs from the expected target', async () => {
    const record = preparationFixture();
    record.identity.run_id = 'production-run-002';
    const failure = await read(record);
    expect(failure).toHaveProperty('message', 'Migration target evidence is invalid.');
    expect(operationFailureLines('verify-import', failure)).toEqual([
      operationLine('verify-import', 'identity-mismatch'),
    ]);
  });
  it('prints config-invalid for a missing token', async () => {
    const failure = await readSealedMigrationTarget({
      expectedTarget: target,
      record: preparationFixture(),
      token: '',
      zoneId: 'b'.repeat(32),
    }).catch((error: unknown) => error);
    expect(operationFailureLines('verify-import', failure)).toEqual([
      operationLine('verify-import', 'config-invalid'),
    ]);
  });
});
