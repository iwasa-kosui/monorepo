import { lstat, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { restartFailedSource } from '../restart-failed-source.mjs';
import { runFailedSourceRestart } from '../source-failed-restart.mjs';
import { createFixtureDirectory } from './fixtureTemp.ts';

const sha = 'a'.repeat(40);
const runId = 'run_1';
const restartRunId = '987654321';
const identity = { main_sha: sha, run_id: runId };
const uid = process.getuid?.() ?? -1;
const roots: string[] = [];
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
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const setup = async (freeze: string | null = JSON.stringify(identity)) => {
  const home = await createFixtureDirectory('iori-restart-');
  roots.push(home);
  const base = join(home, '.iori-migration');
  await mkdir(base, { mode: 0o700 });
  if (freeze !== null) await writeFile(join(base, 'freeze.json'), freeze, { mode: 0o600 });
  return { home, base, record: join(base, 'queue-failed-restart.json') };
};
const systemctlPath = '/usr/bin/systemctl';
const commands = (active: string, calls: string[] = [], located = systemctlPath) => ({
  calls,
  runCommand: async (
    program: string,
    args: string[],
    options: { captureOutput?: (output: { stdout: string; stderr: string }) => Promise<void> },
  ) => {
    calls.push([program, ...args].join(' '));
    if (program === '/bin/sh') await options.captureOutput?.({ stdout: `${located}\n`, stderr: '' });
    if (program === located) {
      await options.captureOutput?.({ stdout: `${active}\n`, stderr: '' });
      if (active !== 'active') throw Object.assign(new Error('Migration command failed.'), { exitCode: 3 });
    }
    return { stdout: '', stderr: '' };
  },
});
const stop = `sudo -n ${systemctlPath} stop microblog`;
const isActive = `${systemctlPath} is-active microblog`;
const start = `sudo -n ${systemctlPath} start microblog`;
const locate = '/bin/sh -c command -v systemctl';
const permitStop = `sudo -n -l ${systemctlPath} stop microblog`;
const permitStart = `sudo -n -l ${systemctlPath} start microblog`;
const preflight = [locate, permitStop, permitStart];
const isService = (args: string[], action: string) => args[1] === systemctlPath && args[2] === action;
const notices = [
  'IORI_NOTICE stage=restart-failed-source recorded=1\n',
  'IORI_NOTICE stage=restart-failed-source stopped=1\n',
  'IORI_NOTICE stage=restart-failed-source started=1\n',
];
const exists = async (path: string) => lstat(path).then(() => true, () => false);
const expectedRecord = { main_sha: sha, run_id: runId, restart_run_id: restartRunId };
const input = { sha, runId, restartRunId };

it('records the attempt with mode 0600, then stops, confirms inactive and starts', async () => {
  const writes = captureStderr();
  const { home, record } = await setup();
  const { calls, runCommand } = commands('inactive');
  await runFailedSourceRestart(input, { home, uid, runCommand });
  expect(calls).toEqual([...preflight, stop, isActive, start]);
  expect(JSON.parse(await readFile(record, 'utf8'))).toEqual(expectedRecord);
  expect((await lstat(record)).mode & 0o777).toBe(0o600);
  expect(writes).toEqual(notices);
});
it('keeps the freeze marker untouched', async () => {
  captureStderr();
  const { home, base } = await setup();
  const { runCommand } = commands('failed');
  await runFailedSourceRestart(input, { home, uid, runCommand });
  expect(await readFile(join(base, 'freeze.json'), 'utf8')).toBe(JSON.stringify(identity));
});
it('writes the record before the stop command runs', async () => {
  captureStderr();
  const { home, record } = await setup();
  const calls: string[] = [];
  const recordAtCall: Record<string, boolean> = {};
  const { runCommand: inner } = commands('inactive', calls);
  const runCommand = async (program: string, args: string[], options: object) => {
    recordAtCall[[program, ...args].join(' ')] = await exists(record);
    return inner(program, args, options as never);
  };
  await runFailedSourceRestart(input, { home, uid, runCommand });
  expect(recordAtCall).toEqual({
    [locate]: false,
    [permitStop]: false,
    [permitStart]: false,
    [stop]: true,
    [isActive]: true,
    [start]: true,
  });
});
it.each([
  ['the freeze marker is missing', null, 'Source freeze is not committed.'],
  ['the freeze marker is not JSON', 'not-json', 'Source freeze is invalid.'],
  [
    'the freeze marker has another main SHA',
    JSON.stringify({ main_sha: 'b'.repeat(40), run_id: runId }),
    'Source freeze identity mismatch.',
  ],
  [
    'the freeze marker has another run ID',
    JSON.stringify({ main_sha: sha, run_id: 'run_2' }),
    'Source freeze identity mismatch.',
  ],
])('calls nothing and records nothing when %s', async (_label, freeze, message) => {
  const writes = captureStderr();
  const { home, record } = await setup(freeze);
  const { calls, runCommand } = commands('inactive');
  await expect(runFailedSourceRestart(input, { home, uid, runCommand })).rejects.toThrow(message);
  expect(calls).toEqual([]);
  expect(await exists(record)).toBe(false);
  expect(writes).toEqual([]);
});
it('calls nothing and records nothing when a pending freeze exists', async () => {
  const writes = captureStderr();
  const { home, base, record } = await setup();
  await writeFile(join(base, 'freeze.pending'), JSON.stringify(identity), { mode: 0o600 });
  const { calls, runCommand } = commands('inactive');
  await expect(runFailedSourceRestart(input, { home, uid, runCommand })).rejects.toThrow(
    'Source pending freeze is present.',
  );
  expect(calls).toEqual([]);
  expect(await exists(record)).toBe(false);
  expect(writes).toEqual([]);
});
it('refuses a second attempt for the same freeze without calling sudo', async () => {
  const writes = captureStderr();
  const { home, record } = await setup();
  const previous = JSON.stringify({ ...expectedRecord, restart_run_id: 'earlier' });
  await writeFile(record, previous, { mode: 0o600 });
  const { calls, runCommand } = commands('inactive');
  await expect(runFailedSourceRestart(input, { home, uid, runCommand })).rejects.toThrow(
    'Source restart was already attempted.',
  );
  expect(calls).toEqual([]);
  expect(await readFile(record, 'utf8')).toBe(previous);
  expect(writes).toEqual([]);
});
it('replaces a record left for another freeze identity and restarts', async () => {
  const writes = captureStderr();
  const { home, record } = await setup();
  await writeFile(record, JSON.stringify({ main_sha: 'b'.repeat(40), run_id: runId, restart_run_id: 'earlier' }), {
    mode: 0o600,
  });
  const { calls, runCommand } = commands('inactive');
  await runFailedSourceRestart(input, { home, uid, runCommand });
  expect(calls).toEqual([...preflight, stop, isActive, start]);
  expect(JSON.parse(await readFile(record, 'utf8'))).toEqual(expectedRecord);
  expect(writes).toEqual(notices);
});
it('keeps an old record when the stale-record replacement is blocked by missing sudo permission', async () => {
  captureStderr();
  const { home, record } = await setup();
  const previous = JSON.stringify({ main_sha: 'b'.repeat(40), run_id: runId, restart_run_id: 'earlier' });
  await writeFile(record, previous, { mode: 0o600 });
  const calls: string[] = [];
  const { runCommand: inner } = commands('inactive', calls);
  const runCommand = async (program: string, args: string[], options: object) => {
    if ([program, ...args].join(' ') === permitStart) {
      calls.push(permitStart);
      throw Object.assign(new Error('Migration command failed.'), { exitCode: 1 });
    }
    return inner(program, args, options as never);
  };
  await expect(runFailedSourceRestart(input, { home, uid, runCommand })).rejects.toThrow(
    'Source service control is not permitted.',
  );
  expect(await readFile(record, 'utf8')).toBe(previous);
});
it.each([
  ['is not JSON', 'not-json'],
  ['is empty', ''],
  ['lacks the restart run ID', JSON.stringify(identity)],
  ['has an extra key', JSON.stringify({ ...expectedRecord, extra: 1 })],
  ['has an invalid restart run ID', JSON.stringify({ ...expectedRecord, restart_run_id: '../bad' })],
  ['is too large', JSON.stringify({ ...expectedRecord, padding: 'x'.repeat(2048) })],
])('calls nothing when the restart record %s', async (_label, content) => {
  const writes = captureStderr();
  const { home, record } = await setup();
  await writeFile(record, content, { mode: 0o600 });
  const { calls, runCommand } = commands('inactive');
  await expect(runFailedSourceRestart(input, { home, uid, runCommand })).rejects.toThrow(
    'Source restart record is invalid.',
  );
  expect(calls).toEqual([]);
  expect(await readFile(record, 'utf8')).toBe(content);
  expect(writes).toEqual([]);
});
it('calls nothing when the restart record is a symlink', async () => {
  captureStderr();
  const { home, record } = await setup();
  await writeFile(join(home, 'target.json'), JSON.stringify(expectedRecord));
  await symlink(join(home, 'target.json'), record);
  const { calls, runCommand } = commands('inactive');
  await expect(runFailedSourceRestart(input, { home, uid, runCommand })).rejects.toThrow(
    'Source restart record is invalid.',
  );
  expect(calls).toEqual([]);
});
it.each([
  ['the stop permission check is denied', permitStop, [locate, permitStop]],
  ['the start permission check is denied', permitStart, preflight],
])('records nothing when %s', async (_label, denied, expected) => {
  const writes = captureStderr();
  const { home, record } = await setup();
  const calls: string[] = [];
  const { runCommand: inner } = commands('inactive', calls);
  const runCommand = async (program: string, args: string[], options: object) => {
    if ([program, ...args].join(' ') === denied) {
      calls.push(denied);
      throw Object.assign(new Error('Migration command failed.'), { exitCode: 1 });
    }
    return inner(program, args, options as never);
  };
  await expect(runFailedSourceRestart(input, { home, uid, runCommand })).rejects.toThrow(
    'Source service control is not permitted.',
  );
  expect(calls).toEqual(expected);
  expect(await exists(record)).toBe(false);
  expect(writes).toEqual([]);
});
it('keeps the record and does not start when the stop command fails, and then refuses another attempt', async () => {
  const writes = captureStderr();
  const { home, record } = await setup();
  const calls: string[] = [];
  const { runCommand: inner } = commands('inactive', calls);
  const runCommand = async (program: string, args: string[], options: object) => {
    if (isService(args, 'stop')) {
      calls.push([program, ...args].join(' '));
      throw new Error('Migration command failed; outcome may be uncertain.');
    }
    return inner(program, args, options as never);
  };
  await expect(runFailedSourceRestart(input, { home, uid, runCommand })).rejects.toThrow(
    'Source service stop failed.',
  );
  expect(calls).toEqual([...preflight, stop]);
  expect(JSON.parse(await readFile(record, 'utf8'))).toEqual(expectedRecord);
  expect(writes).toEqual([notices[0]]);
  const second = commands('inactive');
  await expect(runFailedSourceRestart(input, { home, uid, runCommand: second.runCommand })).rejects.toThrow(
    'Source restart was already attempted.',
  );
  expect(second.calls).toEqual([]);
});
it.each(['active', 'activating', 'deactivating', ''])(
  'does not start when the service reports "%s" after stop',
  async (state) => {
    const writes = captureStderr();
    const { home, record } = await setup();
    const { calls, runCommand } = commands(state);
    await expect(runFailedSourceRestart(input, { home, uid, runCommand })).rejects.toThrow(
      'Source service is not stopped.',
    );
    expect(calls).toEqual([...preflight, stop, isActive]);
    expect(await exists(record)).toBe(true);
    expect(writes).toEqual([notices[0]]);
  },
);
it('reports a failed start without retrying', async () => {
  const writes = captureStderr();
  const { home } = await setup();
  const calls: string[] = [];
  const { runCommand: inner } = commands('inactive', calls);
  const runCommand = async (program: string, args: string[], options: object) => {
    if (isService(args, 'start')) {
      calls.push([program, ...args].join(' '));
      throw new Error('Migration command failed; outcome may be uncertain.');
    }
    return inner(program, args, options as never);
  };
  await expect(runFailedSourceRestart(input, { home, uid, runCommand })).rejects.toThrow(
    'Source service start failed.',
  );
  expect(calls).toEqual([...preflight, stop, isActive, start]);
  expect(writes).toEqual([notices[0], notices[1]]);
});
it('fails before any command when the control directory is unsafe', async () => {
  const { home } = await setup();
  const { calls, runCommand } = commands('inactive');
  await expect(runFailedSourceRestart(input, {
    home,
    uid,
    runCommand,
    guard: async () => {
      throw new Error('Source deployment is blocked.');
    },
  })).rejects.toThrow('Source deployment is blocked.');
  expect(calls).toEqual([]);
});
it.each([
  [{ ...input, sha: 'a'.repeat(39) }],
  [{ ...input, runId: '../bad' }],
  [{ ...input, runId: '' }],
  [{ ...input, restartRunId: '' }],
  [{ ...input, restartRunId: 'a b' }],
  [{ ...input, restartRunId: undefined as unknown as string }],
])('rejects invalid input %j before any command', async (bad) => {
  const { home, record } = await setup();
  const { calls, runCommand } = commands('inactive');
  await expect(runFailedSourceRestart(bad, { home, uid, runCommand })).rejects.toThrow(
    'Invalid source restart operation.',
  );
  expect(calls).toEqual([]);
  expect(await exists(record)).toBe(false);
});

const options = {
  host: 'secret-host.invalid',
  user: 'secret-user',
  mainSha: sha,
  runId,
  restartRunId,
  identityFile: '/fixture/secret-key',
  knownHostsFile: '/fixture/secret_known_hosts',
};
const failedState = {
  source_revision: sha,
  ingress_frozen: true,
  consumer_paused: true,
  queue_failed: true,
  identity,
  http_inflight: 0,
  queue_depth: 7,
  dequeue_work: 0,
  enqueue_work: 0,
  drained: false,
};
const restartedState = { ...failedState, queue_failed: false };
const precheckNotice =
  'IORI_NOTICE stage=restart-precheck ingress_frozen=1 consumer_paused=1 queue_failed=1 drained=0\n';
const sourceWith = (statuses: unknown[]) => {
  const queue = [...statuses];
  const calls: string[] = [];
  const factory = async () =>
    ({
      status: async () => {
        calls.push('status');
        const next = queue.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    }) as never;
  return { calls, factory };
};
const diagnostics = (writes: string[]) => writes.filter(line => line.startsWith('IORI_DIAG'));
const quietRemote = async () => ({ stdout: '', stderr: '' });

it('prints the boolean precheck notice, runs the fixed bundle over SSH stdin and verifies the restarted state', async () => {
  const writes = captureStderr();
  const calls: { program: string; args: string[]; input?: string }[] = [];
  const { calls: statusCalls, factory } = sourceWith([failedState, restartedState]);
  await restartFailedSource(options, {
    sourceFactory: factory,
    runCommand: async (program, args, commandOptions) => {
      calls.push({ program, args, input: commandOptions.input });
      return { stdout: '', stderr: '' };
    },
  });
  expect(statusCalls).toEqual(['status', 'status']);
  expect(calls).toHaveLength(1);
  expect(calls[0].program).toBe('ssh');
  expect(calls[0].args.slice(-3)).toEqual(['"$HOME/.nvm/versions/node/v24.12.0/bin/node"', '--input-type=module', '-']);
  expect(calls[0].args).toContain('StrictHostKeyChecking=yes');
  expect(calls[0].args).toContain('ServerAliveInterval=30');
  expect(calls[0].args).toContain('ServerAliveCountMax=4');
  expect(calls[0].input).toContain('runFailedSourceRestart');
  expect(calls[0].input).toMatch(new RegExp(`"sha": "${sha}"`));
  expect(calls[0].input).toMatch(new RegExp(`"runId": "${runId}"`));
  expect(calls[0].input).toMatch(new RegExp(`"restartRunId": "${restartRunId}"`));
  expect(calls[0].input).toContain('captureOutput: captureSourceCommandOutput');
  expect(writes).toEqual([precheckNotice]);
});
it('prints each boolean as 0 or 1 and nothing else from the status', async () => {
  const writes = captureStderr();
  const state = {
    ...failedState,
    ingress_frozen: false,
    consumer_paused: true,
    queue_failed: true,
    drained: true,
    queue_depth: 123456,
  };
  const { factory } = sourceWith([state, restartedState]);
  await restartFailedSource(options, { sourceFactory: factory, runCommand: quietRemote });
  expect(writes).toEqual([
    'IORI_NOTICE stage=restart-precheck ingress_frozen=0 consumer_paused=1 queue_failed=1 drained=1\n',
  ]);
  expect(writes.join('')).not.toMatch(/123456|secret|fixture|run_1/);
});
it('does not run the remote restart when the queue has not failed', async () => {
  const writes = captureStderr();
  const runCommand = vi.fn(quietRemote);
  const { calls, factory } = sourceWith([restartedState]);
  await expect(restartFailedSource(options, { sourceFactory: factory, runCommand })).rejects.toThrow(
    'Source queue has not failed.',
  );
  expect(runCommand).not.toHaveBeenCalled();
  expect(calls).toEqual(['status']);
  expect(writes).toEqual([
    'IORI_NOTICE stage=restart-precheck ingress_frozen=1 consumer_paused=1 queue_failed=0 drained=0\n',
    'IORI_DIAG stage=restart-precheck program=ssh exit=none signal=none reason=source-queue-not-failed\n',
  ]);
});
it('does not run the remote restart when the precheck status fails', async () => {
  const writes = captureStderr();
  const runCommand = vi.fn(quietRemote);
  const { factory } = sourceWith([new Error('Source operation failed.')]);
  await expect(restartFailedSource(options, { sourceFactory: factory, runCommand })).rejects.toThrow(
    'Source operation failed.',
  );
  expect(runCommand).not.toHaveBeenCalled();
  expect(writes).toEqual([
    'IORI_DIAG stage=restart-precheck program=ssh exit=none signal=none reason=source-operation-failed\n',
  ]);
});
it.each([undefined, '', 'a b', '../bad', 'x'.repeat(81)])(
  'rejects restart run ID %j before opening any source connection',
  async (bad) => {
    const writes = captureStderr();
    const factory = vi.fn();
    await expect(
      restartFailedSource({ ...options, restartRunId: bad as string }, { sourceFactory: factory }),
    ).rejects.toThrow('Invalid source restart operation.');
    expect(factory).not.toHaveBeenCalled();
    expect(diagnostics(writes)).toEqual([
      'IORI_DIAG stage=inputs program=none exit=none signal=none reason=invalid-restart-operation\n',
    ]);
  },
);
it.each([
  ['the queue is still failed', { ...restartedState, queue_failed: true }],
  ['ingress is not frozen', { ...restartedState, ingress_frozen: false }],
  ['the consumer is not paused', { ...restartedState, consumer_paused: false }],
  ['no identity is held', { ...restartedState, identity: null }],
])('fails verification when %s after the restart', async (_label, after) => {
  const writes = captureStderr();
  const { factory } = sourceWith([failedState, after]);
  await expect(restartFailedSource(options, { sourceFactory: factory, runCommand: quietRemote })).rejects.toThrow(
    'Source restart was not confirmed.',
  );
  expect(diagnostics(writes)).toEqual([
    'IORI_DIAG stage=restart-verify program=ssh exit=none signal=none reason=restart-not-confirmed\n',
  ]);
});
it('retries the verification status while source control is not ready after the restart', async () => {
  const writes = captureStderr();
  const notReady = Object.assign(new Error('Source control is not ready.'), { retryable: true });
  const { calls, factory } = sourceWith([failedState, notReady, notReady, restartedState]);
  await restartFailedSource(options, {
    sourceFactory: factory,
    runCommand: quietRemote,
    statusRetryTimeoutMs: 200,
    statusRetryIntervalMs: 5,
  });
  expect(calls).toEqual(['status', 'status', 'status', 'status']);
  const exhausted = sourceWith([failedState, notReady, notReady, notReady]);
  await expect(restartFailedSource(options, {
    sourceFactory: exhausted.factory,
    runCommand: quietRemote,
    statusRetryTimeoutMs: 8,
    statusRetryIntervalMs: 5,
  })).rejects.toThrow('Source control is not ready.');
  expect(diagnostics(writes)).toEqual([
    'IORI_DIAG stage=restart-verify program=ssh exit=none signal=none reason=source-control-not-ready\n',
  ]);
});
it('relays exactly the recorded, stopped and started notices and nothing near them', async () => {
  const writes = captureStderr();
  const accepted = [
    'IORI_NOTICE stage=restart-failed-source recorded=1',
    'IORI_NOTICE stage=restart-failed-source stopped=1',
    'IORI_NOTICE stage=restart-failed-source started=1',
  ];
  const { factory } = sourceWith([failedState, restartedState]);
  await restartFailedSource(options, {
    sourceFactory: factory,
    runCommand: async (_program, _args, commandOptions) => {
      await commandOptions.captureOutput?.({
        stdout: '',
        stderr: [
          ...accepted,
          ...accepted.map(line => `${line} extra=/home/secret`),
          ...accepted.map(line => ` ${line}`),
          ...accepted.map(line => `${line}\r`),
          'IORI_NOTICE stage=restart-failed-source recorded=0',
          'IORI_NOTICE stage=restart-failed-source stopped=11',
          'IORI_NOTICE stage=restart-failed-source restarted=1',
          'IORI_NOTICE stage=restart-precheck ingress_frozen=1 consumer_paused=1 queue_failed=1 drained=1',
          'IORI_NOTICE stage=other started=1',
          'secret-user@secret-host.invalid: noise',
        ].join('\n'),
      });
      return { stdout: '', stderr: '' };
    },
  });
  expect(writes).toEqual([precheckNotice, ...accepted.map(line => `${line}\n`)]);
});
it('relays the notices that precede a remote failure and skips verification', async () => {
  const writes = captureStderr();
  const { calls, factory } = sourceWith([failedState]);
  await expect(restartFailedSource(options, {
    sourceFactory: factory,
    runCommand: async (_program, _args, commandOptions) => {
      await commandOptions.captureOutput?.({
        stdout: '',
        stderr: 'IORI_NOTICE stage=restart-failed-source recorded=1\nError: Source service stop failed.',
      });
      throw Object.assign(new Error('x'), { exitCode: 1 });
    },
  })).rejects.toThrow('x');
  expect(calls).toEqual(['status']);
  expect(writes).toEqual([
    precheckNotice,
    'IORI_NOTICE stage=restart-failed-source recorded=1\n',
    'IORI_DIAG stage=restart-remote program=ssh exit=1 signal=none reason=service-stop-failed\n',
  ]);
});
it.each([
  ['Error: Invalid source restart operation.', 'invalid-restart-operation'],
  ['Error: Source pending freeze is present.', 'pending-freeze-present'],
  ['Error: Source freeze is not committed.', 'freeze-not-committed'],
  ['Error: Source pending freeze is invalid.', 'pending-freeze-invalid'],
  ['Error: Source freeze is invalid.', 'freeze-invalid'],
  ['Error: Source freeze identity mismatch.', 'freeze-identity-mismatch'],
  ['Error: Source restart was already attempted.', 'restart-already-attempted'],
  ['Error: Source restart record is invalid.', 'restart-record-invalid'],
  ['Error: Source restart record failed.', 'restart-record-failed'],
  ['Error: Source service control is not permitted.', 'service-control-not-permitted'],
  ['Error: Source service stop failed.', 'service-stop-failed'],
  ['Error: Source service is not stopped.', 'service-not-stopped'],
  ['Error: Source service start failed.', 'service-start-failed'],
])('classifies remote stderr %s as %s without status verification', async (stderr, reason) => {
  const writes = captureStderr();
  const { factory } = sourceWith([failedState]);
  await expect(restartFailedSource(options, {
    sourceFactory: factory,
    runCommand: async (_program, _args, commandOptions) => {
      await commandOptions.captureOutput?.({ stdout: '', stderr });
      throw Object.assign(new Error('x'), { exitCode: 1 });
    },
  })).rejects.toThrow('x');
  expect(diagnostics(writes)).toEqual([
    `IORI_DIAG stage=restart-remote program=ssh exit=1 signal=none reason=${reason}\n`,
  ]);
  expect(writes.join('')).not.toMatch(/secret|fixture/);
});
