import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { assertWorkflowOutput } from '../assert-workflow-output.mjs';
import {
  decideD1Baseline,
  deployReviewedWorkerVersion,
  parseInitialMigrationTables,
} from '../deploy-reviewed-worker-version.mjs';
import { createTargetIdentity } from '../fresh-target.mjs';
import { OPERATION_STAGES, operationFailureLines } from '../operation-diagnostics.mjs';
import { createSourceSshAdapter } from '../source-control-ssh.mjs';
import { createTargetControlPlane } from '../target-control-plane.mjs';
import { createFixtureDirectory } from './fixtureTemp.ts';

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
    'deploy-worker-before',
    'deploy-worker-resolve',
    'deploy-worker-migrate',
    'deploy-worker-deploy',
    'deploy-worker-after',
    'put-worker-secrets',
    'put-worker-secrets-read',
    'put-worker-secrets-put',
    'put-bluesky-secrets',
    'put-bluesky-secrets-read',
    'put-bluesky-secrets-put',
    'put-twitterapi',
    'put-twitterapi-read',
    'put-twitterapi-put',
    'rehearsal-delete',
    'rehearsal-delete-list',
    'rehearsal-delete-check',
    'rehearsal-delete-remove',
    'rehearsal-delete-verify',
    'move-reposts',
    'move-reposts-resolve',
    'move-reposts-query',
    'events-stats',
    'events-stats-resolve',
    'events-stats-query',
    'digest-quality',
    'digest-quality-resolve',
    'digest-quality-query',
    'delete-posts',
    'delete-posts-resolve',
    'delete-posts-query',
    'prune-posts',
    'prune-posts-resolve',
    'prune-posts-query',
    'archive-bucket',
    'archive-bucket-resolve',
    'archive-bucket-read',
    'archive-bucket-create',
    'archive-bucket-verify',
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
    'deploy-worker-before',
    operationFailure('state-mismatch', ['resource-consumer-script', 'resource-d1']),
  );
  expect(lines).toEqual([
    operationLine('deploy-worker-before', 'resource-consumer-script'),
    operationLine('deploy-worker-before', 'resource-d1'),
    operationLine('deploy-worker-before', 'state-mismatch'),
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
  const lines = operationFailureLines('deploy-worker-migrate', operationFailure('state-mismatch', details));
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
  expect(lines[8]).toBe(operationLine('deploy-worker-migrate', 'state-mismatch'));
});
it('drops details outside the allowed vocabulary', () => {
  const lines = operationFailureLines(
    'deploy-worker-migrate',
    operationFailure('mismatch', ['https://secret.invalid', 'Resource D1', 7, null, 'resource-d1']),
  );
  expect(lines).toEqual([
    operationLine('deploy-worker-migrate', 'resource-d1'),
    operationLine('deploy-worker-migrate', 'mismatch'),
  ]);
  expect(operationFailureLines('deploy-worker-migrate', operationFailure('mismatch', 'resource-d1'))).toEqual([
    operationLine('deploy-worker-migrate', 'mismatch'),
  ]);
});
it('classifies by diagnostic reason, then abort names, then unclassified', () => {
  expect(operationFailureLines('deploy-worker-resolve', operationFailure('state-mismatch'))).toEqual([
    operationLine('deploy-worker-resolve', 'state-mismatch'),
  ]);
  expect(operationFailureLines('deploy-worker-resolve', operationFailure('https://secret.invalid'))).toEqual([
    operationLine('deploy-worker-resolve', 'unclassified'),
  ]);
  for (const name of ['AbortError', 'TimeoutError']) {
    expect(operationFailureLines('deploy-worker-resolve', Object.assign(new Error('x'), { name }))).toEqual([
      operationLine('deploy-worker-resolve', 'aborted'),
    ]);
  }
  expect(operationFailureLines('deploy-worker-resolve', new Error('x'))).toEqual([
    operationLine('deploy-worker-resolve', 'unclassified'),
  ]);
  expect(operationFailureLines('deploy-worker-resolve', undefined)).toEqual([
    operationLine('deploy-worker-resolve', 'unclassified'),
  ]);
  expect(operationFailureLines('deploy-worker-resolve', 'text')).toEqual([
    operationLine('deploy-worker-resolve', 'unclassified'),
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
  expect(operationFailureLines('deploy-worker-resolve', aggregate)).toEqual([
    operationLine('deploy-worker-resolve', 'resource-consumer-script'),
    operationLine('deploy-worker-resolve', 'state-mismatch'),
  ]);
  const aborted = new AggregateError([Object.assign(new Error('x'), { name: 'AbortError' })], 'x');
  expect(operationFailureLines('deploy-worker-resolve', aborted)).toEqual([
    operationLine('deploy-worker-resolve', 'aborted'),
  ]);
  expect(operationFailureLines('deploy-worker-resolve', new AggregateError([], 'x'))).toEqual([
    operationLine('deploy-worker-resolve', 'unclassified'),
  ]);
  const own = Object.assign(new AggregateError([inner], 'x'), { diagnostic: { reason: 'mismatch' } });
  expect(operationFailureLines('deploy-worker-resolve', own)).toEqual([
    operationLine('deploy-worker-resolve', 'mismatch'),
  ]);
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
  const failure = await adapter.resume('destination_writes_not_enabled').catch((error: unknown) => error);
  expect(operationFailureLines('deploy-worker-migrate', failure)).toEqual([
    operationLine('deploy-worker-migrate', reason),
  ]);
});
it.each([
  ['{"ok":false,"error":"control_rejected"}\n', 'rejected'],
  ['{"ok":false,"error":"control_rejected","detail":"estimate-query"}\n', 'estimate-query'],
])('prints the source word of a real adapter rejection %j', async (stdout, reason) => {
  const adapter = await createSourceSshAdapter(await sshOptions(), {
    spawnProcess: exitingSpawn(1, stdout) as never,
  });
  const failure = await adapter.resume('destination_writes_not_enabled').catch((error: unknown) => error);
  expect(operationFailureLines('deploy-worker-migrate', failure)).toEqual([
    operationLine('deploy-worker-migrate', reason),
  ]);
});
const identity = createTargetIdentity({
  environment: 'staging',
  generation: 'fixture1',
  accountId: 'a'.repeat(32),
});
const queueResponse = (id: string, name: string, consumers: unknown[], paused = true) => ({
  queue_id: id,
  queue_name: name,
  created_on: '2026-09-05T00:00:00Z',
  settings: { delivery_paused: paused },
  consumers,
  producers: [],
  consumers_total_count: consumers.length,
  producers_total_count: 0,
});
it('prints the consumer script detail and state-mismatch of a real readActiveResources failure', async () => {
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
    [`/r2/buckets/${identity.names.eventArchive}`]: { name: identity.names.eventArchive },
    [`/r2/buckets/${identity.names.transfer}`]: { name: identity.names.transfer },
    [`/r2/buckets/${identity.names.transfer}/domains/managed`]: { enabled: false },
    '/queues/queue-id': queueResponse('queue-id', identity.names.queue, [consumer], false),
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
  const failure = await api.readActiveResources({
    d1Id: 'db-id',
    kvId: 'kv-id',
    queueId: 'queue-id',
    dlqId: 'dlq-id',
  }).catch((error: unknown) => error);
  expect(operationFailureLines('deploy-worker-before', failure)).toEqual([
    operationLine('deploy-worker-before', 'resource-consumer-script'),
    operationLine('deploy-worker-before', 'state-mismatch'),
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
      r2_buckets: [{ bucket_name: identity.names.uploads }, { bucket_name: identity.names.eventArchive }],
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
        r2_buckets: [{ bucket_name: identity.names.uploads }, { bucket_name: identity.names.eventArchive }],
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
  const initialName = '0000_boring_xavin.sql';
  const initialTables = async () =>
    parseInitialMigrationTables(
      await readFile(new URL(`../../drizzle-d1/${initialName}`, import.meta.url), 'utf8'),
    );
  const d1Json = (results: unknown[]) => JSON.stringify([{ results, success: true, meta: {} }]);
  const scenario = (present: string[], count?: number) => {
    const calls: string[][] = [];
    const runCommand = vi.fn(async (_program: string, args: string[], options: { env: Record<string, string> }) => {
      calls.push(args);
      if (args[2] === 'deploy') {
        await writeFile(
          options.env.WRANGLER_OUTPUT_FILE_PATH!,
          `${JSON.stringify({ type: 'deploy', version: 1, worker_name: identity.workerName, version_id: 'next' })}\n`,
        );
      }
      const sql = args[args.indexOf('--command') + 1] ?? '';
      if (sql.startsWith('SELECT name FROM sqlite_master')) {
        return { status: 0, stdout: d1Json(present.map((name) => ({ name }))), stderr: '' };
      }
      if (sql.startsWith('SELECT COUNT(*)')) return { status: 0, stdout: d1Json([{ count }]), stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    });
    return { calls, runCommand };
  };
  const execute = (path: string, sql: string, json: boolean) => [
    'exec',
    'wrangler',
    'd1',
    'execute',
    'DB',
    '--remote',
    '--config',
    path,
    ...(json ? ['--json'] : []),
    '--command',
    sql,
  ];
  const readSql = (tables: string[]) =>
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${
      ['d1_migrations', ...tables].map((name) => `'${name}'`).join(', ')
    })`;
  const countSql = 'SELECT COUNT(*) AS count FROM d1_migrations';
  const baselineSql = `CREATE TABLE IF NOT EXISTS d1_migrations(
\t\tid         INTEGER PRIMARY KEY AUTOINCREMENT,
\t\tname       TEXT UNIQUE,
\t\tapplied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO d1_migrations (name) VALUES ('${initialName}');`;
  const applyArgs = (
    path: string,
  ) => ['exec', 'wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', path];
  const deployArgs = (path: string) => ['exec', 'wrangler', 'deploy', '--config', path, '--minify'];
  it('applies the D1 migrations without a baseline when the migration table already has rows', async () => {
    const tables = await initialTables();
    const { calls, runCommand } = scenario(['d1_migrations', ...tables], 1);
    const stages: string[] = [];
    const { path, input } = await deployInput(runCommand, (stage) => stages.push(stage));
    await expect(deployReviewedWorkerVersion(input)).resolves.toBe('next');
    expect(calls).toEqual([
      execute(path, readSql(tables), true),
      execute(path, countSql, true),
      applyArgs(path),
      deployArgs(path),
    ]);
    expect(stages).toEqual(['deploy-worker-migrate', 'deploy-worker-deploy']);
  });
  it('records the baseline before the migration when the schema exists without migration records', async () => {
    const tables = await initialTables();
    const { calls, runCommand } = scenario(tables);
    const { path, input } = await deployInput(runCommand, () => {});
    await expect(deployReviewedWorkerVersion(input)).resolves.toBe('next');
    expect(calls).toEqual([
      execute(path, readSql(tables), true),
      execute(path, baselineSql, false),
      applyArgs(path),
      deployArgs(path),
    ]);
  });
  it('records the baseline when the migration table exists with no rows and the schema exists', async () => {
    const tables = await initialTables();
    const { calls, runCommand } = scenario(['d1_migrations', ...tables], 0);
    const { path, input } = await deployInput(runCommand, () => {});
    await expect(deployReviewedWorkerVersion(input)).resolves.toBe('next');
    expect(calls).toEqual([
      execute(path, readSql(tables), true),
      execute(path, countSql, true),
      execute(path, baselineSql, false),
      applyArgs(path),
      deployArgs(path),
    ]);
  });
  it('applies the migrations from the start without a baseline on a new database', async () => {
    const tables = await initialTables();
    const { calls, runCommand } = scenario([]);
    const { path, input } = await deployInput(runCommand, () => {});
    await expect(deployReviewedWorkerVersion(input)).resolves.toBe('next');
    expect(calls).toEqual([execute(path, readSql(tables), true), applyArgs(path), deployArgs(path)]);
  });
  it('applies the migrations without a baseline when only an empty migration table exists', async () => {
    const tables = await initialTables();
    const { calls, runCommand } = scenario(['d1_migrations'], 0);
    const { path, input } = await deployInput(runCommand, () => {});
    await expect(deployReviewedWorkerVersion(input)).resolves.toBe('next');
    expect(calls).toEqual([
      execute(path, readSql(tables), true),
      execute(path, countSql, true),
      applyArgs(path),
      deployArgs(path),
    ]);
  });
  it('stops with d1-baseline-mismatch and does not write, apply or deploy when only part of the schema exists', async () => {
    const tables = await initialTables();
    const { calls, runCommand } = scenario(tables.slice(1));
    const stages: string[] = [];
    const { path, input } = await deployInput(runCommand, (stage) => stages.push(stage));
    const failure = await deployReviewedWorkerVersion(input).catch((error: unknown) => error);
    expect(calls).toEqual([execute(path, readSql(tables), true)]);
    expect(stages).toEqual(['deploy-worker-migrate']);
    expect(operationFailureLines(stages.at(-1)!, failure)).toEqual([
      operationLine('deploy-worker-migrate', 'd1-baseline-mismatch'),
    ]);
  });
  it.each([
    ['is not JSON', 'not json'],
    ['is not an array', JSON.stringify({ results: [] })],
    ['reports a failed statement', JSON.stringify([{ results: [], success: false }])],
    ['has rows without a name', JSON.stringify([{ results: [{ other: 1 }], success: true }])],
  ])('stops with d1-baseline-mismatch before any write when the read output %s', async (_name, stdout) => {
    const calls: string[][] = [];
    const runCommand = vi.fn(async (_program: string, args: string[]) => {
      calls.push(args);
      return { status: 0, stdout, stderr: '' };
    });
    const stages: string[] = [];
    const { input } = await deployInput(runCommand, (stage) => stages.push(stage));
    const failure = await deployReviewedWorkerVersion(input).catch((error: unknown) => error);
    expect(calls).toHaveLength(1);
    expect(operationFailureLines(stages.at(-1)!, failure)).toEqual([
      operationLine('deploy-worker-migrate', 'd1-baseline-mismatch'),
    ]);
  });
  it('stops with d1-baseline-mismatch when the row count is not a number', async () => {
    const tables = await initialTables();
    const { calls, runCommand } = scenario(['d1_migrations', ...tables], undefined);
    const stages: string[] = [];
    const { path, input } = await deployInput(runCommand, (stage) => stages.push(stage));
    const failure = await deployReviewedWorkerVersion(input).catch((error: unknown) => error);
    expect(calls).toEqual([execute(path, readSql(tables), true), execute(path, countSql, true)]);
    expect(operationFailureLines(stages.at(-1)!, failure)).toEqual([
      operationLine('deploy-worker-migrate', 'd1-baseline-mismatch'),
    ]);
  });
  it('stops with command-failed and does not apply or deploy when the baseline write fails', async () => {
    const tables = await initialTables();
    const calls: string[][] = [];
    const runCommand = vi.fn(async (_program: string, args: string[]) => {
      calls.push(args);
      const sql = args[args.indexOf('--command') + 1] ?? '';
      return sql.startsWith('SELECT')
        ? { status: 0, stdout: d1Json(tables.map((name) => ({ name }))), stderr: '' }
        : { status: 1, stdout: '', stderr: '' };
    });
    const stages: string[] = [];
    const { path, input } = await deployInput(runCommand, (stage) => stages.push(stage));
    const failure = await deployReviewedWorkerVersion(input).catch((error: unknown) => error);
    expect(calls).toEqual([execute(path, readSql(tables), true), execute(path, baselineSql, false)]);
    expect(operationFailureLines(stages.at(-1)!, failure)).toEqual([
      operationLine('deploy-worker-migrate', 'command-failed'),
    ]);
  });
  it.each([
    ['reports a failed exit status', async () => ({ status: 1, stdout: 'private diagnostic', stderr: '' })],
    ['rejects', async () => Promise.reject(new Error('Migration command failed; outcome may be uncertain.'))],
  ])('does not deploy and prints command-failed at deploy-worker-migrate when the read %s', async (_name, run) => {
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
  it('does not deploy and prints command-failed at deploy-worker-migrate when the migration fails', async () => {
    const tables = await initialTables();
    const { calls, runCommand } = scenario([]);
    runCommand.mockImplementation(async (_program: string, args: string[]) => {
      calls.push(args);
      return args[3] === 'migrations'
        ? { status: 1, stdout: 'private diagnostic', stderr: '' }
        : { status: 0, stdout: d1Json([]), stderr: '' };
    });
    const stages: string[] = [];
    const { path, input } = await deployInput(runCommand, (stage) => stages.push(stage));
    const failure = await deployReviewedWorkerVersion(input).catch((error: unknown) => error);
    expect(calls).toEqual([execute(path, readSql(tables), true), applyArgs(path)]);
    expect(operationFailureLines(stages.at(-1)!, failure)).toEqual([
      operationLine('deploy-worker-migrate', 'command-failed'),
    ]);
  });
  it('does not deploy and prints aborted at deploy-worker-migrate when the command rejects after the signal aborts', async () => {
    const controller = new AbortController();
    const runCommand = vi.fn(async () => {
      controller.abort();
      throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    });
    const stages: string[] = [];
    const { input } = await deployInput(runCommand, (stage) => stages.push(stage));
    const failure = await deployReviewedWorkerVersion({ ...input, signal: controller.signal }).catch((
      error: unknown,
    ) => error);
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(stages).toEqual(['deploy-worker-migrate']);
    expect(operationFailureLines(stages.at(-1)!, failure)).toEqual([
      operationLine('deploy-worker-migrate', 'aborted'),
    ]);
  });
  it('does not deploy and prints aborted at deploy-worker-migrate when the signal aborts after the command succeeds', async () => {
    const controller = new AbortController();
    const runCommand = vi.fn(async () => {
      controller.abort();
      return { status: 0, stdout: d1Json([]), stderr: '' };
    });
    const stages: string[] = [];
    const { input } = await deployInput(runCommand, (stage) => stages.push(stage));
    const failure = await deployReviewedWorkerVersion({ ...input, signal: controller.signal }).catch((
      error: unknown,
    ) => error);
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(stages).toEqual(['deploy-worker-migrate']);
    expect(operationFailureLines(stages.at(-1)!, failure)).toEqual([
      operationLine('deploy-worker-migrate', 'aborted'),
    ]);
  });
  it('parses the table names that the initial migration creates', () => {
    expect(
      parseInitialMigrationTables(
        'CREATE TABLE `actors` (\n\t`id` text\n);\n--> statement-breakpoint\nCREATE UNIQUE INDEX `actors_uri_unique` ON `actors` (`uri`);\nCREATE TABLE `domain_events` (\n\t`eventId` text\n);',
      ),
    ).toEqual(['actors', 'domain_events']);
    expect(parseInitialMigrationTables('CREATE INDEX `x` ON `y` (`z`);')).toEqual([]);
  });
  it('lists every table that the real initial migration creates', async () => {
    const tables = await initialTables();
    expect(tables).toContain('actors');
    expect(tables).toContain('domain_events');
    expect(tables.length).toBeGreaterThan(5);
  });
  it.each([
    [['a', 'b'], ['a', 'b', 'd1_migrations'], 3, 'apply'],
    [['a', 'b'], ['a', 'b'], undefined, 'baseline'],
    [['a', 'b'], ['a', 'b', 'd1_migrations'], 0, 'baseline'],
    [['a', 'b'], [], undefined, 'apply'],
    [['a', 'b'], ['d1_migrations'], 0, 'apply'],
    [['a', 'b'], ['a'], undefined, 'mismatch'],
    [['a', 'b'], ['a', 'd1_migrations'], 0, 'mismatch'],
  ])(
    'decides the baseline for %j with present %j and %s rows as %s',
    (initialTables, presentTables, rows, expected) => {
      expect(decideD1Baseline({ initialTables, presentTables, migrationRows: rows })).toBe(expected);
    },
  );
});
it('prints config-invalid for the configuration messages of the two operation scripts', () => {
  for (
    const message of [
      'Protected workflow invocation is invalid.',
    ]
  ) {
    expect(operationFailureLines('deploy-worker-migrate', new Error(message))).toEqual([
      operationLine('deploy-worker-migrate', 'config-invalid'),
    ]);
  }
});
