import { EventEmitter } from 'node:events';
import { chmod, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';

import { createSourceSshAdapter } from '../source-control-ssh.mjs';
import { SOURCE_LIMITS } from '../source-transfer-protocol.mjs';
import { createFixtureDirectory } from './fixtureTemp.ts';

const state = {
  source_revision: 'a'.repeat(40),
  identity: { main_sha: 'a'.repeat(40), run_id: '123' },
  ingress_frozen: true,
  http_inflight: 0,
  queue_depth: 0,
  dequeue_work: 0,
  enqueue_work: 0,
  consumer_paused: true,
  queue_failed: false,
  drained: true,
};
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
const setup = async () => {
  const root = await createFixtureDirectory('iori-ssh-fixture-');
  roots.push(root);
  const identityFile = join(root, 'fixture.key');
  const knownHostsFile = join(root, 'known_hosts');
  await writeFile(identityFile, 'synthetic-not-a-key', { mode: 0o600 });
  await writeFile(knownHostsFile, 'synthetic', { mode: 0o600 });
  return {
    root,
    options: {
      host: 'source.example.invalid',
      user: 'fixture',
      mainSha: 'a'.repeat(40),
      runId: '123',
      identityFile,
      knownHostsFile,
    },
  };
};
it('validates private inputs before remote work and uses only fixed reviewed SSH command tokens', async () => {
  const { options } = await setup();
  const calls: { program: string; args: string[] }[] = [];
  const spawnProcess = (program: string, args: string[]) => {
    calls.push({ program, args });
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: () => true,
    });
    queueMicrotask(() => {
      child.stdout.end(JSON.stringify({ ok: true, state }) + '\n');
      child.stderr.end('PRIVATE SHOULD NOT ESCAPE');
      child.emit('close', 0);
    });
    return child;
  };
  const adapter = await createSourceSshAdapter(options, { spawnProcess });
  expect(await adapter.status()).toMatchObject({ ingress_frozen: true });
  expect(calls[0].program).toBe('ssh');
  expect(calls[0].args.slice(-6)).toEqual([
    'source.example.invalid',
    '"$HOME/.nvm/versions/node/v24.12.0/bin/node"',
    '"$HOME/monorepo/apps/iori/scripts/source-control.mjs"',
    'status',
    options.mainSha,
    '123',
  ]);
  expect(calls[0].args).toContain('StrictHostKeyChecking=yes');
  expect(calls[0].args).toContain('ServerAliveInterval=30');
  expect(calls[0].args).toContain('ServerAliveCountMax=4');
  expect(calls[0].args).toContain(`UserKnownHostsFile=${options.knownHostsFile}`);
  await expect(createSourceSshAdapter({ ...options, host: 'x;touch /tmp/x' }, { spawnProcess })).rejects.toThrow();
  await expect(
    createSourceSshAdapter({ ...options, identityFile: join(options.identityFile, 'missing') }, { spawnProcess }),
  ).rejects.toThrow();
  await chmod(options.identityFile, 0o644);
  await expect(createSourceSshAdapter(options, { spawnProcess })).rejects.toThrow('Invalid source inputs.');
  expect(calls).toHaveLength(1);
});
it.each(['destination_writes_not_enabled', 'destination_writes_reconciled'] as const)(
  'sends resume with the fixed recovery value %s and the frozen identity only',
  async (recovery) => {
    const { options } = await setup();
    const calls: { program: string; args: string[] }[] = [];
    const spawnProcess = (program: string, args: string[]) => {
      calls.push({ program, args });
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: () => true,
      });
      queueMicrotask(() => {
        child.stdout.end(
          JSON.stringify({
            ok: true,
            state: { ...state, identity: null, ingress_frozen: false, consumer_paused: false, drained: false },
          })
            + '\n',
        );
        child.emit('close', 0);
      });
      return child;
    };
    const adapter = await createSourceSshAdapter(options, { spawnProcess });
    expect(await adapter.resume(recovery)).toMatchObject({ ingress_frozen: false, identity: null });
    expect(calls[0].args.slice(-6)).toEqual([
      '"$HOME/.nvm/versions/node/v24.12.0/bin/node"',
      '"$HOME/monorepo/apps/iori/scripts/source-control.mjs"',
      'resume',
      options.mainSha,
      '123',
      recovery,
    ]);
    await expect(adapter.resume('anything_else' as never)).rejects.toThrow('Invalid source command.');
    expect(calls).toHaveLength(1);
  },
);
const exitingSpawn = (code: number) => () => {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: () => true,
  });
  queueMicrotask(() => {
    child.stdout.end();
    child.stderr.end('PRIVATE SHOULD NOT ESCAPE');
    child.emit('close', code);
  });
  return child;
};
it.each([
  [75, 'Source control is not ready.', true],
  [76, 'Source is not idle.', false],
  [255, 'Source operation failed.', false],
  [1, 'Source operation failed.', false],
])('maps the status exit code %d to "%s"', async (code, message, retryable) => {
  const { options } = await setup();
  const adapter = await createSourceSshAdapter(options, { spawnProcess: exitingSpawn(code) });
  const failure = await adapter.status().catch((error) => error);
  expect(failure.message).toBe(message);
  expect(failure.retryable === true).toBe(retryable);
});
it('does not mark exit code 75 from another operation as retryable', async () => {
  const { options } = await setup();
  const adapter = await createSourceSshAdapter(options, { spawnProcess: exitingSpawn(75) });
  const failure = await adapter.resume('destination_writes_not_enabled').catch((error) => error);
  expect(failure.message).toBe('Source operation failed.');
  expect(failure.retryable).toBeUndefined();
});
it('reports exit code 76 from an operation other than status as not idle', async () => {
  const { options } = await setup();
  const adapter = await createSourceSshAdapter(options, { spawnProcess: exitingSpawn(76) });
  const failure = await adapter.resume('destination_writes_not_enabled').catch((error) => error);
  expect(failure.message).toBe('Source is not idle.');
  expect(failure.retryable).toBeUndefined();
});
const respondingSpawn = (stdout: string, code: number) => () => {
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
const resumeFailure = async (spawnProcess: never, signal?: AbortSignal) => {
  const { options } = await setup();
  const adapter = await createSourceSshAdapter(options, { spawnProcess });
  return adapter.resume('destination_writes_not_enabled', signal).catch((error) => error);
};
it.each([
  ['{"ok":false,"error":"control_rejected"}\n', 'rejected'],
  ['{"ok":false,"error":"control_rejected","detail":"estimate-query"}\n', 'estimate-query'],
  ['{"ok":false,"error":"control_rejected","detail":"estimate-limit"}\n', 'estimate-limit'],
  ['{"ok":false,"error":"control_rejected","detail":"password=hunter2"}\n', 'rejected'],
  ['{"ok":false,"error":"control_rejected","detail":["estimate-query"]}\n', 'rejected'],
  ['{"ok":false,"error":"identity_mismatch","detail":"estimate-query"}\n', 'rejected'],
])('gives the rejected response %j the reason %s', async (stdout, reason) => {
  const failure = await resumeFailure(respondingSpawn(stdout, 1) as never);
  expect(failure.diagnostic).toEqual({ reason, exit: 1, signal: undefined });
  expect(JSON.stringify(failure.diagnostic)).not.toContain('PRIVATE');
});
it('keeps both retryable and the diagnostic for a status that ends with exit code 75', async () => {
  const { options } = await setup();
  const adapter = await createSourceSshAdapter(options, { spawnProcess: exitingSpawn(75) });
  const failure = await adapter.status().catch((error) => error);
  expect(failure.message).toBe('Source control is not ready.');
  expect(failure.retryable).toBe(true);
  expect(failure.diagnostic).toEqual({ reason: 'not-ready', exit: 75, signal: undefined });
});
it('gives a resume that exceeds its time limit the reason aborted', async () => {
  const { options } = await setup();
  let started!: () => void;
  const spawned = new Promise<void>((resolve) => {
    started = resolve;
  });
  const spawnProcess = () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: () => {
        queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
        return true;
      },
    });
    started();
    return child;
  };
  const adapter = await createSourceSshAdapter(options, { spawnProcess: spawnProcess as never });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const pending = adapter.resume('destination_writes_not_enabled').catch((error) => error);
    await spawned;
    await vi.advanceTimersByTimeAsync(SOURCE_LIMITS.estimateMs + 10_000);
    const failure = await pending;
    expect(failure.diagnostic).toEqual({ reason: 'aborted', exit: undefined, signal: 'SIGTERM' });
  } finally {
    vi.useRealTimers();
  }
});
it('gives an aborted resume the reason aborted and the signal that ended the process', async () => {
  const abort = new AbortController();
  const spawnProcess = () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: () => {
        queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
        return true;
      },
    });
    queueMicrotask(() => abort.abort());
    return child;
  };
  const failure = await resumeFailure(spawnProcess as never, abort.signal);
  expect(failure.diagnostic).toEqual({ reason: 'aborted', exit: undefined, signal: 'SIGTERM' });
});
