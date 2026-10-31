import { lstat, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { releasePendingFreeze } from '../release-pending-freeze.mjs';
import { runPendingFreezeRelease } from '../source-pending-freeze-release.mjs';
import { createFixtureDirectory } from './fixtureTemp.ts';

const sha = 'a'.repeat(40);
const runId = 'run_1';
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
const setup = async (pending: string | null = JSON.stringify({ main_sha: sha, run_id: runId })) => {
  const home = await createFixtureDirectory('iori-release-');
  roots.push(home);
  const base = join(home, '.iori-migration');
  await mkdir(base, { mode: 0o700 });
  if (pending !== null) await writeFile(join(base, 'freeze.pending'), pending, { mode: 0o600 });
  return { home, base };
};
const commands = (active: string, calls: string[] = []) => ({
  calls,
  runCommand: async (
    program: string,
    args: string[],
    options: { captureOutput?: (output: { stdout: string; stderr: string }) => Promise<void> },
  ) => {
    calls.push([program, ...args].join(' '));
    if (program === 'systemctl') {
      await options.captureOutput?.({ stdout: `${active}\n`, stderr: '' });
      if (active !== 'active') throw Object.assign(new Error('Migration command failed.'), { exitCode: 3 });
    }
    return { stdout: '', stderr: '' };
  },
});
const stop = 'sudo -n systemctl stop microblog';
const isActive = 'systemctl is-active microblog';
const start = 'sudo -n systemctl start microblog';
const exists = async (path: string) => lstat(path).then(() => true, () => false);

it.each(['inactive', 'failed'])(
  'renames the pending marker after a stop confirmed as %s and then starts',
  async (state) => {
    const writes = captureStderr();
    const { home, base } = await setup();
    const before = await lstat(join(base, 'freeze.pending'));
    const { calls, runCommand } = commands(state);
    await runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand });
    expect(calls).toEqual([stop, isActive, start]);
    expect(await exists(join(base, 'freeze.pending'))).toBe(false);
    const moved = await lstat(join(base, `freeze.pending.rejected-${runId}`));
    expect([moved.dev, moved.ino]).toEqual([before.dev, before.ino]);
    expect(await readFile(join(base, `freeze.pending.rejected-${runId}`), 'utf8')).toBe(
      JSON.stringify({ main_sha: sha, run_id: runId }),
    );
    expect(writes).toEqual(['IORI_NOTICE stage=release-pending-freeze renamed=1\n']);
  },
);
it.each(['active', 'activating', 'deactivating', ''])(
  'changes nothing and does not start when the service reports "%s" after stop',
  async (state) => {
    const writes = captureStderr();
    const { home, base } = await setup();
    const { calls, runCommand } = commands(state);
    await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
      'Source service is not stopped.',
    );
    expect(calls).toEqual([stop, isActive]);
    expect(await exists(join(base, 'freeze.pending'))).toBe(true);
    expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(false);
    expect(writes).toEqual([]);
  },
);
it('does not continue or start when the stop command fails', async () => {
  const { home, base } = await setup();
  const calls: string[] = [];
  const runCommand = async (program: string, args: string[]) => {
    calls.push([program, ...args].join(' '));
    throw new Error('Migration command failed; outcome may be uncertain.');
  };
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source service stop failed.',
  );
  expect(calls).toEqual([stop]);
  expect(await exists(join(base, 'freeze.pending'))).toBe(true);
});
it('fails without renaming or starting when a committed freeze marker exists', async () => {
  const { home, base } = await setup();
  await writeFile(join(base, 'freeze.json'), JSON.stringify({ main_sha: sha, run_id: runId }));
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source freeze is already committed.',
  );
  expect(calls).toEqual([stop, isActive]);
  expect(await exists(join(base, 'freeze.pending'))).toBe(true);
});
it('fails without renaming or starting when a committed freeze marker is a dangling symlink', async () => {
  const { home, base } = await setup();
  await symlink('/nonexistent-fixture', join(base, 'freeze.json'));
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source freeze is already committed.',
  );
  expect(calls).toEqual([stop, isActive]);
});
it('fails when the pending marker is a symlink', async () => {
  const { home, base } = await setup(null);
  await writeFile(join(home, 'target.json'), JSON.stringify({ main_sha: sha, run_id: runId }));
  await symlink(join(home, 'target.json'), join(base, 'freeze.pending'));
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source pending freeze is invalid.',
  );
  expect(calls).toEqual([stop, isActive]);
  expect((await lstat(join(base, 'freeze.pending'))).isSymbolicLink()).toBe(true);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(false);
});
it('fails when the pending marker is owned by another user', async () => {
  const { home, base } = await setup();
  const { calls, runCommand } = commands('inactive');
  await expect(
    runPendingFreezeRelease({ sha, runId }, { home, uid: uid + 1, runCommand, guard: async () => {} }),
  ).rejects.toThrow('Source pending freeze is invalid.');
  expect(calls).toEqual([stop, isActive]);
  expect(await exists(join(base, 'freeze.pending'))).toBe(true);
});
it.each([
  ['is missing', null],
  ['is empty', ''],
  ['is not JSON', 'not-json'],
  ['has an extra key', JSON.stringify({ main_sha: sha, run_id: runId, extra: 1 })],
  ['is too large', JSON.stringify({ main_sha: sha, run_id: runId, padding: 'x'.repeat(2048) })],
])('fails without renaming or starting when the pending marker %s', async (_label, content) => {
  const { home, base } = await setup(content);
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source pending freeze is invalid.',
  );
  expect(calls).toEqual([stop, isActive]);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(false);
});
it.each([
  ['main SHA', { main_sha: 'b'.repeat(40), run_id: runId }],
  ['run ID', { main_sha: sha, run_id: 'run_2' }],
])('fails without renaming or starting when the pending %s differs', async (_label, identity) => {
  const { home, base } = await setup(JSON.stringify(identity));
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source pending freeze identity mismatch.',
  );
  expect(calls).toEqual([stop, isActive]);
  expect(await exists(join(base, 'freeze.pending'))).toBe(true);
});
it('fails without overwriting or starting when the rejected destination already exists', async () => {
  const { home, base } = await setup();
  await writeFile(join(base, `freeze.pending.rejected-${runId}`), 'previous');
  const writes = captureStderr();
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source release destination exists.',
  );
  expect(calls).toEqual([stop, isActive]);
  expect(await readFile(join(base, `freeze.pending.rejected-${runId}`), 'utf8')).toBe('previous');
  expect(await exists(join(base, 'freeze.pending'))).toBe(true);
  expect(writes).toEqual([]);
});
it('fails before any command when the control directory is unsafe', async () => {
  const { home } = await setup();
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, {
    home,
    uid,
    runCommand,
    guard: async () => {
      throw new Error('Source deployment is blocked.');
    },
  })).rejects.toThrow('Source deployment is blocked.');
  expect(calls).toEqual([]);
});
it('does not start the service when the control directory becomes unsafe before start', async () => {
  const { home, base } = await setup();
  const { calls, runCommand } = commands('inactive');
  let checks = 0;
  await expect(runPendingFreezeRelease({ sha, runId }, {
    home,
    uid,
    runCommand,
    guard: async () => {
      if (++checks === 4) throw new Error('Source deployment is blocked.');
    },
  })).rejects.toThrow('Source deployment is blocked.');
  expect(calls).toEqual([stop, isActive]);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(true);
});
it('reports a failed start without retrying and keeps the renamed marker', async () => {
  captureStderr();
  const { home, base } = await setup();
  const calls: string[] = [];
  const { runCommand: inner } = commands('inactive', calls);
  const runCommand = async (program: string, args: string[], options: object) => {
    if (args.includes('start')) {
      calls.push([program, ...args].join(' '));
      throw new Error('Migration command failed; outcome may be uncertain.');
    }
    return inner(program, args, options as never);
  };
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source service start failed.',
  );
  expect(calls).toEqual([stop, isActive, start]);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(true);
});
it.each([
  [{ sha: 'a'.repeat(39), runId }],
  [{ sha, runId: '../bad' }],
  [{ sha, runId: '' }],
])('rejects invalid identity %j before any command', async (input) => {
  const { home } = await setup();
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease(input, { home, uid, runCommand })).rejects.toThrow(
    'Invalid source release operation.',
  );
  expect(calls).toEqual([]);
});

const options = {
  host: 'secret-host.invalid',
  user: 'secret-user',
  mainSha: sha,
  runId,
  identityFile: '/fixture/secret-key',
  knownHostsFile: '/fixture/secret_known_hosts',
};
const openState = {
  source_revision: sha,
  ingress_frozen: false,
  consumer_paused: false,
  queue_failed: false,
  identity: null,
  http_inflight: 0,
  queue_depth: 0,
  dequeue_work: 0,
  enqueue_work: 0,
  drained: false,
};
const notice = 'IORI_NOTICE stage=release-pending-freeze renamed=1';
const sourceWith = (statuses: unknown[]) => {
  const queue = [...statuses];
  return async () =>
    ({
      status: async () => {
        const next = queue.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    }) as never;
};
it('runs the fixed bundle over SSH stdin and then requires an unfrozen status', async () => {
  const writes = captureStderr();
  const calls: { program: string; args: string[]; input?: string }[] = [];
  await releasePendingFreeze(options, {
    sourceFactory: sourceWith([openState]),
    runCommand: async (program, args, commandOptions) => {
      calls.push({ program, args, input: commandOptions.input });
      await commandOptions.captureOutput?.({
        stdout: '',
        stderr: [notice, `${notice} extra=/home/secret`, ` ${notice}`, 'secret-user@secret-host.invalid: noise'].join(
          '\n',
        ),
      });
      return { stdout: '', stderr: '' };
    },
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].program).toBe('ssh');
  expect(calls[0].args.slice(-3)).toEqual(['"$HOME/.nvm/versions/node/v24.12.0/bin/node"', '--input-type=module', '-']);
  expect(calls[0].args).toContain('StrictHostKeyChecking=yes');
  expect(calls[0].input).toContain('runPendingFreezeRelease');
  expect(calls[0].input).toMatch(new RegExp(`"sha": "${sha}"`));
  expect(calls[0].input).toMatch(new RegExp(`"runId": "${runId}"`));
  expect(calls[0].input).toContain('captureOutput: captureSourceCommandOutput');
  expect(writes).toEqual([`${notice}\n`]);
});
it.each([
  ['ingress is still frozen', { ...openState, ingress_frozen: true }],
  ['the consumer is still paused', { ...openState, consumer_paused: true }],
])('fails when %s after the release', async (_label, state) => {
  const writes = captureStderr();
  await expect(releasePendingFreeze(options, {
    sourceFactory: sourceWith([state]),
    runCommand: async () => ({ stdout: '', stderr: '' }),
  })).rejects.toThrow('Source release was not confirmed.');
  expect(writes.filter(line => line.startsWith('IORI_DIAG'))).toEqual([
    'IORI_DIAG stage=release-verify program=ssh exit=none signal=none reason=release-not-confirmed\n',
  ]);
});
it('retries the status while source control is not ready after the restart', async () => {
  const notReady = Object.assign(new Error('Source control is not ready.'), { retryable: true });
  await releasePendingFreeze(options, {
    sourceFactory: sourceWith([notReady, notReady, openState]),
    runCommand: async () => ({ stdout: '', stderr: '' }),
    statusRetryTimeoutMs: 200,
    statusRetryIntervalMs: 5,
  });
  const writes = captureStderr();
  await expect(releasePendingFreeze(options, {
    sourceFactory: sourceWith([notReady, notReady, notReady]),
    runCommand: async () => ({ stdout: '', stderr: '' }),
    statusRetryTimeoutMs: 8,
    statusRetryIntervalMs: 5,
  })).rejects.toThrow('Source control is not ready.');
  expect(writes.filter(line => line.startsWith('IORI_DIAG'))).toEqual([
    'IORI_DIAG stage=release-verify program=ssh exit=none signal=none reason=source-control-not-ready\n',
  ]);
});
it.each([
  ['Error: Source service is not stopped.', 'service-not-stopped'],
  ['Error: Source service stop failed.', 'service-stop-failed'],
  ['Error: Source service start failed.', 'service-start-failed'],
  ['Error: Source freeze is already committed.', 'freeze-committed'],
  ['Error: Source pending freeze is invalid.', 'pending-freeze-invalid'],
  ['Error: Source pending freeze identity mismatch.', 'pending-identity-mismatch'],
  ['Error: Source release destination exists.', 'release-target-exists'],
  ['Error: Source release rename verification failed.', 'release-rename-failed'],
  ['Error: Invalid source release operation.', 'invalid-release-operation'],
])('classifies remote stderr %s as %s without status', async (stderr, reason) => {
  const writes = captureStderr();
  await expect(releasePendingFreeze(options, {
    sourceFactory: sourceWith([new Error('must not reach verification')]),
    runCommand: async (_program, _args, commandOptions) => {
      await commandOptions.captureOutput?.({ stdout: '', stderr });
      throw Object.assign(new Error('x'), { exitCode: 1 });
    },
  })).rejects.toThrow('x');
  expect(writes.filter(line => line.startsWith('IORI_DIAG'))).toEqual([
    `IORI_DIAG stage=release-remote program=ssh exit=1 signal=none reason=${reason}\n`,
  ]);
  expect(writes.join('')).not.toMatch(/secret|fixture/);
});
it('relays the rename notice even when the remote stage fails afterwards', async () => {
  const writes = captureStderr();
  await expect(releasePendingFreeze(options, {
    sourceFactory: sourceWith([]),
    runCommand: async (_program, _args, commandOptions) => {
      await commandOptions.captureOutput?.({ stdout: '', stderr: `${notice}\nError: Source service start failed.` });
      throw Object.assign(new Error('x'), { exitCode: 1 });
    },
  })).rejects.toThrow('x');
  expect(writes.filter(line => line.startsWith('IORI_NOTICE'))).toEqual([`${notice}\n`]);
});
