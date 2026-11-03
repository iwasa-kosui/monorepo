import { link, lstat, mkdir, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { releasePendingFreeze } from '../release-pending-freeze.mjs';
import { runPendingFreezeRelease } from '../source-pending-freeze-release.mjs';
import { createFixtureDirectory } from './fixtureTemp.ts';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, unlink: vi.fn(actual.unlink) };
});

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
const stopped = 'IORI_NOTICE stage=release-pending-freeze stopped=1\n';
const exists = async (path: string) => lstat(path).then(() => true, () => false);

it.each(['inactive', 'failed'])(
  'renames the pending marker after a stop confirmed as %s and then starts',
  async (state) => {
    const writes = captureStderr();
    const { home, base } = await setup();
    const before = await lstat(join(base, 'freeze.pending'));
    const { calls, runCommand } = commands(state);
    await runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand });
    expect(calls).toEqual([...preflight, stop, isActive, start]);
    expect(await exists(join(base, 'freeze.pending'))).toBe(false);
    const moved = await lstat(join(base, `freeze.pending.rejected-${runId}`));
    expect([moved.dev, moved.ino]).toEqual([before.dev, before.ino]);
    expect(await readFile(join(base, `freeze.pending.rejected-${runId}`), 'utf8')).toBe(
      JSON.stringify({ main_sha: sha, run_id: runId }),
    );
    expect(writes).toEqual([stopped, 'IORI_NOTICE stage=release-pending-freeze renamed=1\n']);
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
    expect(calls).toEqual([...preflight, stop, isActive]);
    expect(await exists(join(base, 'freeze.pending'))).toBe(true);
    expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(false);
    expect(writes).toEqual([]);
  },
);
it('does not continue or start when the stop command fails', async () => {
  const { home, base } = await setup();
  const calls: string[] = [];
  const { runCommand: inner } = commands('inactive', calls);
  const runCommand = async (program: string, args: string[], options: object) => {
    if (isService(args, 'stop')) {
      calls.push([program, ...args].join(' '));
      throw new Error('Migration command failed; outcome may be uncertain.');
    }
    return inner(program, args, options as never);
  };
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source service stop failed.',
  );
  expect(calls).toEqual([...preflight, stop]);
  expect(await exists(join(base, 'freeze.pending'))).toBe(true);
});
it('fails without stopping when a committed freeze marker exists', async () => {
  const { home, base } = await setup();
  await writeFile(join(base, 'freeze.json'), JSON.stringify({ main_sha: sha, run_id: runId }));
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source freeze is already committed.',
  );
  expect(calls).toEqual([]);
  expect(await exists(join(base, 'freeze.pending'))).toBe(true);
});
it('fails without stopping when a committed freeze marker is a dangling symlink', async () => {
  const { home, base } = await setup();
  await symlink('/nonexistent-fixture', join(base, 'freeze.json'));
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source freeze is already committed.',
  );
  expect(calls).toEqual([]);
});
it('fails without stopping when the pending marker is a symlink', async () => {
  const { home, base } = await setup(null);
  await writeFile(join(home, 'target.json'), JSON.stringify({ main_sha: sha, run_id: runId }));
  await symlink(join(home, 'target.json'), join(base, 'freeze.pending'));
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source pending freeze is invalid.',
  );
  expect(calls).toEqual([]);
  expect((await lstat(join(base, 'freeze.pending'))).isSymbolicLink()).toBe(true);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(false);
});
it('fails without stopping when the pending marker is owned by another user', async () => {
  const { home, base } = await setup();
  const { calls, runCommand } = commands('inactive');
  await expect(
    runPendingFreezeRelease({ sha, runId }, { home, uid: uid + 1, runCommand, guard: async () => {} }),
  ).rejects.toThrow('Source pending freeze is invalid.');
  expect(calls).toEqual([]);
  expect(await exists(join(base, 'freeze.pending'))).toBe(true);
});
it.each([
  ['is missing', null],
  ['is empty', ''],
  ['is not JSON', 'not-json'],
  ['has an extra key', JSON.stringify({ main_sha: sha, run_id: runId, extra: 1 })],
  ['is too large', JSON.stringify({ main_sha: sha, run_id: runId, padding: 'x'.repeat(2048) })],
])('fails without stopping when the pending marker %s', async (_label, content) => {
  const { home, base } = await setup(content);
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source pending freeze is invalid.',
  );
  expect(calls).toEqual([]);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(false);
});
it.each([
  ['main SHA', { main_sha: 'b'.repeat(40), run_id: runId }],
  ['run ID', { main_sha: sha, run_id: 'run_2' }],
])('fails without stopping when the pending %s differs', async (_label, identity) => {
  const { home, base } = await setup(JSON.stringify(identity));
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source pending freeze identity mismatch.',
  );
  expect(calls).toEqual([]);
  expect(await exists(join(base, 'freeze.pending'))).toBe(true);
});
it('fails without stopping or overwriting when the rejected destination already exists', async () => {
  const { home, base } = await setup();
  await writeFile(join(base, `freeze.pending.rejected-${runId}`), 'previous');
  const writes = captureStderr();
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source release destination exists.',
  );
  expect(calls).toEqual([]);
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
      if (++checks === 5) throw new Error('Source deployment is blocked.');
    },
  })).rejects.toThrow('Source deployment is blocked.');
  expect(calls).toEqual([...preflight, stop, isActive]);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(true);
});
it('fails without renaming or starting when the pending marker is replaced during the stop', async () => {
  const writes = captureStderr();
  const { home, base } = await setup();
  const before = await lstat(join(base, 'freeze.pending'));
  const calls: string[] = [];
  const { runCommand: inner } = commands('inactive', calls);
  const runCommand = async (program: string, args: string[], options: object) => {
    if (isService(args, 'stop')) {
      await writeFile(join(base, 'replacement'), JSON.stringify({ main_sha: sha, run_id: runId }), { mode: 0o600 });
      await rename(join(base, 'replacement'), join(base, 'freeze.pending'));
    }
    return inner(program, args, options as never);
  };
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source pending freeze is invalid.',
  );
  expect(calls).toEqual([...preflight, stop, isActive]);
  expect((await lstat(join(base, 'freeze.pending'))).ino).not.toBe(before.ino);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(false);
  expect(writes).toEqual([stopped]);
});
it('reports a failed start without retrying and keeps the renamed marker', async () => {
  captureStderr();
  const { home, base } = await setup();
  const calls: string[] = [];
  const { runCommand: inner } = commands('inactive', calls);
  const runCommand = async (program: string, args: string[], options: object) => {
    if (isService(args, 'start')) {
      calls.push([program, ...args].join(' '));
      throw new Error('Migration command failed; outcome may be uncertain.');
    }
    return inner(program, args, options as never);
  };
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source service start failed.',
  );
  expect(calls).toEqual([...preflight, stop, isActive, start]);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(true);
});
it('fails on the second inspection without renaming or starting when a committed freeze appears during the stop', async () => {
  const writes = captureStderr();
  const { home, base } = await setup();
  const calls: string[] = [];
  const { runCommand: inner } = commands('inactive', calls);
  const runCommand = async (program: string, args: string[], options: object) => {
    if (isService(args, 'stop')) {
      await writeFile(join(base, 'freeze.json'), JSON.stringify({ main_sha: sha, run_id: runId }), { mode: 0o600 });
    }
    return inner(program, args, options as never);
  };
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source freeze is already committed.',
  );
  expect(calls).toEqual([...preflight, stop, isActive]);
  expect(await exists(join(base, 'freeze.pending'))).toBe(true);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(false);
  expect(writes).toEqual([stopped]);
});
it('fails without changing anything when the rejected destination is a dangling symlink', async () => {
  const writes = captureStderr();
  const { home, base } = await setup();
  await symlink('/nonexistent-fixture', join(base, `freeze.pending.rejected-${runId}`));
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source release destination exists.',
  );
  expect(calls).toEqual([]);
  expect(await exists(join(base, 'freeze.pending'))).toBe(true);
  expect((await lstat(join(base, `freeze.pending.rejected-${runId}`))).isSymbolicLink()).toBe(true);
  expect(writes).toEqual([]);
});
it('fails at link without removing the pending marker when a dangling symlink appears just before the link', async () => {
  const writes = captureStderr();
  const { home, base } = await setup();
  const { calls, runCommand } = commands('inactive');
  let checks = 0;
  // The fourth guard call is the last one before the link: initial, stop, post-stop, then pre-link.
  const guard = async () => {
    if (++checks === 4) await symlink('/nonexistent-fixture', join(base, `freeze.pending.rejected-${runId}`));
  };
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand, guard })).rejects.toThrow(
    'Source release destination exists.',
  );
  expect(checks).toBe(4);
  expect(calls).toEqual([...preflight, stop, isActive]);
  expect(await exists(join(base, 'freeze.pending'))).toBe(true);
  expect((await lstat(join(base, `freeze.pending.rejected-${runId}`))).isSymbolicLink()).toBe(true);
  expect(writes).toEqual([stopped]);
});
const alreadyRenamed = 'IORI_NOTICE stage=release-pending-freeze already_renamed=1\n';
const setupRenamed = async (content: string | null = JSON.stringify({ main_sha: sha, run_id: runId })) => {
  const { home, base } = await setup(null);
  if (content !== null) await writeFile(join(base, `freeze.pending.rejected-${runId}`), content, { mode: 0o600 });
  return { home, base };
};
const denyOnly = (denied: string, calls: string[], located = systemctlPath) => {
  const { runCommand: inner } = commands('inactive', calls, located);
  return async (program: string, args: string[], options: object) => {
    if ([program, ...args].join(' ') === denied) {
      calls.push(denied);
      throw Object.assign(new Error('Migration command failed.'), { exitCode: 1 });
    }
    return inner(program, args, options as never);
  };
};
const notPermitted = 'Source service control is not permitted.';
it.each([
  ['the stop permission check exits non-zero', permitStop, systemctlPath, [locate, permitStop]],
  ['the start permission check exits non-zero', permitStart, systemctlPath, preflight],
])('fails without stopping or starting when %s', async (_label, denied, located, expected) => {
  const { home, base } = await setup();
  const calls: string[] = [];
  const runCommand = denyOnly(denied, calls, located);
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(notPermitted);
  expect(calls).toEqual(expected);
  expect(calls).not.toContain(stop);
  expect(calls).not.toContain(start);
  expect(await exists(join(base, 'freeze.pending'))).toBe(true);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(false);
});
it.each([
  ['is empty', ''],
  ['is a relative path', 'systemctl'],
  ['contains an unsafe character', '/usr/bin/system ctl;reboot'],
])('fails without stopping or starting when command -v systemctl %s', async (_label, located) => {
  const { home, base } = await setup();
  const { calls, runCommand } = commands('inactive', [], located);
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(notPermitted);
  expect(calls).toEqual([locate]);
  expect(calls).not.toContain(stop);
  expect(calls).not.toContain(start);
  expect(await exists(join(base, 'freeze.pending'))).toBe(true);
});
it('fails without starting when the start permission is missing for an already renamed marker', async () => {
  const writes = captureStderr();
  const { home, base } = await setupRenamed();
  const calls: string[] = [];
  const runCommand = denyOnly(permitStart, calls);
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(notPermitted);
  expect(calls).toEqual(preflight);
  expect(calls).not.toContain(start);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(true);
  expect(writes).toEqual([]);
});
it('only starts and does not stop or link when the marker was already renamed', async () => {
  const writes = captureStderr();
  const { home, base } = await setupRenamed();
  const before = await lstat(join(base, `freeze.pending.rejected-${runId}`));
  const { calls, runCommand } = commands('inactive');
  await runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand });
  expect(calls).toEqual([...preflight, start]);
  expect(await exists(join(base, 'freeze.pending'))).toBe(false);
  const after = await lstat(join(base, `freeze.pending.rejected-${runId}`));
  expect([after.dev, after.ino]).toEqual([before.dev, before.ino]);
  expect(writes).toEqual([alreadyRenamed]);
});
it('reports a failed start for an already renamed marker without retrying', async () => {
  captureStderr();
  const { home, base } = await setupRenamed();
  const calls: string[] = [];
  const { runCommand: inner } = commands('inactive', calls);
  const runCommand = async (program: string, args: string[], options: object) => {
    if (isService(args, 'start')) {
      calls.push([program, ...args].join(' '));
      throw new Error('Migration command failed; outcome may be uncertain.');
    }
    return inner(program, args, options as never);
  };
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source service start failed.',
  );
  expect(calls).toEqual([...preflight, start]);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(true);
});
it.each([
  ['is a symlink', null, 'Source pending freeze is invalid.'],
  ['is not JSON', 'not-json', 'Source pending freeze is invalid.'],
  ['has an extra key', JSON.stringify({ main_sha: sha, run_id: runId, extra: 1 }), 'Source pending freeze is invalid.'],
  [
    'is too large',
    JSON.stringify({ main_sha: sha, run_id: runId, padding: 'x'.repeat(2048) }),
    'Source pending freeze is invalid.',
  ],
  [
    'has another run ID',
    JSON.stringify({ main_sha: sha, run_id: 'run_2' }),
    'Source pending freeze identity mismatch.',
  ],
  [
    'has another main SHA',
    JSON.stringify({ main_sha: 'b'.repeat(40), run_id: runId }),
    'Source pending freeze identity mismatch.',
  ],
])('does not treat the marker as renamed when the rejected file %s', async (label, content, message) => {
  const writes = captureStderr();
  const { home, base } = await setupRenamed(content);
  if (label === 'is a symlink') {
    await writeFile(join(home, 'target.json'), JSON.stringify({ main_sha: sha, run_id: runId }));
    await symlink(join(home, 'target.json'), join(base, `freeze.pending.rejected-${runId}`));
  }
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(message);
  expect(calls).toEqual([]);
  expect(await exists(join(base, 'freeze.pending'))).toBe(false);
  expect(writes).toEqual([]);
});
it('does not treat the marker as renamed when the rejected file is owned by another user', async () => {
  const writes = captureStderr();
  const { home, base } = await setupRenamed();
  const { calls, runCommand } = commands('inactive');
  await expect(
    runPendingFreezeRelease({ sha, runId }, { home, uid: uid + 1, runCommand, guard: async () => {} }),
  ).rejects.toThrow('Source pending freeze is invalid.');
  expect(calls).toEqual([]);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(true);
  expect(writes).toEqual([]);
});
it('does not treat the marker as renamed when a committed freeze exists', async () => {
  const writes = captureStderr();
  const { home, base } = await setupRenamed();
  await writeFile(join(base, 'freeze.json'), JSON.stringify({ main_sha: sha, run_id: runId }));
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source freeze is already committed.',
  );
  expect(calls).toEqual([]);
  expect(writes).toEqual([]);
});
it('stops, then only unlinks the pending marker and starts when a hard link was left by an interrupted rename', async () => {
  const writes = captureStderr();
  const { home, base } = await setup();
  const pendingPath = join(base, 'freeze.pending');
  const rejectedPath = join(base, `freeze.pending.rejected-${runId}`);
  await link(pendingPath, rejectedPath);
  const before = await lstat(rejectedPath);
  const calls: string[] = [];
  const pendingAtCall: Record<string, boolean> = {};
  const { runCommand: inner } = commands('inactive', calls);
  const runCommand = async (program: string, args: string[], options: object) => {
    pendingAtCall[[program, ...args].join(' ')] = await exists(pendingPath);
    return inner(program, args, options as never);
  };
  await runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand });
  expect(calls).toEqual([...preflight, stop, isActive, start]);
  expect(pendingAtCall).toEqual({
    [locate]: true,
    [permitStop]: true,
    [permitStart]: true,
    [stop]: true,
    [isActive]: true,
    [start]: false,
  });
  const after = await lstat(rejectedPath);
  expect([after.dev, after.ino]).toEqual([before.dev, before.ino]);
  expect(after.nlink).toBe(1);
  // A link call would fail with EEXIST on the existing destination, so success also proves it was skipped.
  expect(writes).toEqual([stopped, 'IORI_NOTICE stage=release-pending-freeze renamed=1\n']);
});
it('does not unlink or start when the service is not stopped and a hard link was left', async () => {
  const writes = captureStderr();
  const { home, base } = await setup();
  const pendingPath = join(base, 'freeze.pending');
  const rejectedPath = join(base, `freeze.pending.rejected-${runId}`);
  await link(pendingPath, rejectedPath);
  const { calls, runCommand } = commands('active');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source service is not stopped.',
  );
  expect(calls).toEqual([...preflight, stop, isActive]);
  const [pending, rejected] = [await lstat(pendingPath), await lstat(rejectedPath)];
  expect([pending.dev, pending.ino]).toEqual([rejected.dev, rejected.ino]);
  expect(writes).toEqual([]);
});
it('fails without stopping when both files exist with different inodes', async () => {
  const writes = captureStderr();
  const { home, base } = await setup();
  const pendingPath = join(base, 'freeze.pending');
  const rejectedPath = join(base, `freeze.pending.rejected-${runId}`);
  await writeFile(rejectedPath, JSON.stringify({ main_sha: sha, run_id: runId }), { mode: 0o600 });
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source release destination exists.',
  );
  expect(calls).toEqual([]);
  const [pending, rejected] = [await lstat(pendingPath), await lstat(rejectedPath)];
  expect(pending.ino).not.toBe(rejected.ino);
  expect(writes).toEqual([]);
});
it('does not start when the guard fails right before the start for an already renamed marker', async () => {
  const writes = captureStderr();
  const { home, base } = await setupRenamed();
  const { calls, runCommand } = commands('inactive');
  let checks = 0;
  await expect(runPendingFreezeRelease({ sha, runId }, {
    home,
    uid,
    runCommand,
    guard: async () => {
      if (++checks === 2) throw new Error('Source deployment is blocked.');
    },
  })).rejects.toThrow('Source deployment is blocked.');
  expect(checks).toBe(2);
  expect(calls).toEqual(preflight);
  expect(calls).not.toContain(start);
  expect(await exists(join(base, `freeze.pending.rejected-${runId}`))).toBe(true);
  expect(writes).toEqual([alreadyRenamed]);
});
it('keeps both files and does not start when the unlink fails after the link', async () => {
  const writes = captureStderr();
  const { home, base } = await setup();
  const pendingPath = join(base, 'freeze.pending');
  const rejectedPath = join(base, `freeze.pending.rejected-${runId}`);
  vi.mocked(unlink).mockRejectedValueOnce(Object.assign(new Error('unlink failed'), { code: 'EPERM' }));
  const { calls, runCommand } = commands('inactive');
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow(
    'Source release rename verification failed.',
  );
  expect(calls).toEqual([...preflight, stop, isActive]);
  expect(calls).not.toContain(start);
  const [pending, rejected] = [await lstat(pendingPath), await lstat(rejectedPath)];
  expect([pending.dev, pending.ino]).toEqual([rejected.dev, rejected.ino]);
  expect(writes).toEqual([stopped]);
});
it.each([
  ['the stop permission check is denied', permitStop],
  ['the start permission check is denied', permitStart],
  ['the stop command fails', stop],
])('does not report the stopped notice when %s', async (_label, denied) => {
  const writes = captureStderr();
  const { home } = await setup();
  const runCommand = denyOnly(denied, []);
  await expect(runPendingFreezeRelease({ sha, runId }, { home, uid, runCommand })).rejects.toThrow();
  expect(writes).toEqual([]);
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
  expect(calls[0].args).toContain('ServerAliveInterval=30');
  expect(calls[0].args).toContain('ServerAliveCountMax=4');
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
    statusRetryTimeoutMs: 5000,
    statusRetryIntervalMs: 5,
  });
  const writes = captureStderr();
  let statusCalls = 0;
  await expect(releasePendingFreeze(options, {
    sourceFactory: async () =>
      ({
        status: async () => {
          statusCalls++;
          throw notReady;
        },
      }) as never,
    runCommand: async () => ({ stdout: '', stderr: '' }),
    statusRetryTimeoutMs: 1000,
    statusRetryIntervalMs: 5,
  })).rejects.toThrow('Source control is not ready.');
  expect(statusCalls).toBeGreaterThanOrEqual(2);
  expect(writes.filter(line => line.startsWith('IORI_DIAG'))).toEqual([
    'IORI_DIAG stage=release-verify program=ssh exit=none signal=none reason=source-control-not-ready\n',
  ]);
}, 15_000);
it.each([
  ['Error: Source service is not stopped.', 'service-not-stopped'],
  ['Error: Source service stop failed.', 'service-stop-failed'],
  ['Error: Source service start failed.', 'service-start-failed'],
  ['Error: Source service control is not permitted.', 'service-control-not-permitted'],
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
it('relays the already renamed notice exactly and nothing near it', async () => {
  const writes = captureStderr();
  const accepted = 'IORI_NOTICE stage=release-pending-freeze already_renamed=1';
  await releasePendingFreeze(options, {
    sourceFactory: sourceWith([openState]),
    runCommand: async (_program, _args, commandOptions) => {
      await commandOptions.captureOutput?.({
        stdout: '',
        stderr: [
          accepted,
          `${accepted} extra=/home/secret`,
          `${accepted} path=/home/secret/freeze.pending.rejected-run_1`,
          ` ${accepted}`,
          `${accepted} `,
          `${accepted}\r`,
          'IORI_NOTICE stage=release-pending-freeze already_renamed=0',
          'IORI_NOTICE stage=release-pending-freeze already_renamed=11',
          'IORI_NOTICE stage=release-pending-freeze already_renamed=',
          'IORI_NOTICE stage=release-pending-freeze already_renamed',
          'IORI_NOTICE stage=other already_renamed=1',
          'secret-user@secret-host.invalid: noise',
        ].join('\n'),
      });
      return { stdout: '', stderr: '' };
    },
  });
  expect(writes).toEqual([`${accepted}\n`]);
});
it('relays the stopped notice exactly and nothing near it', async () => {
  const writes = captureStderr();
  const accepted = 'IORI_NOTICE stage=release-pending-freeze stopped=1';
  await releasePendingFreeze(options, {
    sourceFactory: sourceWith([openState]),
    runCommand: async (_program, _args, commandOptions) => {
      await commandOptions.captureOutput?.({
        stdout: '',
        stderr: [
          accepted,
          `${accepted} extra=/home/secret`,
          ` ${accepted}`,
          `${accepted} `,
          `${accepted}\r`,
          'IORI_NOTICE stage=release-pending-freeze stopped=0',
          'IORI_NOTICE stage=release-pending-freeze stopped=11',
          'IORI_NOTICE stage=release-pending-freeze stopped=',
          'IORI_NOTICE stage=release-pending-freeze stopped',
          'IORI_NOTICE stage=other stopped=1',
          'secret-user@secret-host.invalid: noise',
        ].join('\n'),
      });
      return { stdout: '', stderr: '' };
    },
  });
  expect(writes).toEqual([`${accepted}\n`]);
});
