import { spawn } from 'node:child_process';
import { chmod, lstat, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFixtureDirectory } from '../../../../scripts/__tests__/fixtureTemp.ts';
import { listenControlSocket, removeStaleControlSocket } from './controlSocket.ts';
import { SourceControl } from './sourceControl.ts';

const skipChmod = vi.hoisted(() => ({ value: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    chmod: (...args: Parameters<typeof actual.chmod>) => skipChmod.value ? undefined : actual.chmod(...args),
  };
});

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});
const setup = async () => {
  const base = await createFixtureDirectory('iori-socket-', true);
  dirs.push(base);
  const queue = {
    pause: () => {},
    resume: () => {},
    depth: async () => 0,
    snapshot: () => ({ paused: true, enqueueWork: 0, dequeueWork: 0, failed: false }),
  };
  const control = await SourceControl.open({ base, queue, revision: 'a'.repeat(40) });
  return { base, queue, control };
};
// Leaves a socket file behind the way SIGKILL does: the owner dies without unlinking it.
const leaveStaleSocket = async (path: string, mode = 0o600) => {
  const child = spawn(process.execPath, [
    '-e',
    `const p=${
      JSON.stringify(path)
    };require('node:net').createServer().listen(p,()=>{require('node:fs').chmodSync(p,${mode});console.log('ready')})`,
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((resolve) => child.stdout.once('data', resolve));
  child.kill('SIGKILL');
  await new Promise((resolve) => child.once('close', resolve));
};
const request = (path: string, input: string) =>
  new Promise<string>((resolve, reject) => {
    const socket = connect(path);
    let output = '';
    socket.on('connect', () => socket.write(input));
    socket.on('data', (chunk) => {
      output += chunk;
    });
    socket.on('end', () => resolve(output));
    socket.on('error', reject);
  });
describe('private socket', () => {
  it('serves fixed bounded JSON over local Unix socket and refuses a second owner', async () => {
    const { base, control } = await setup();
    const server = await listenControlSocket(control);
    try {
      const path = join(base, 'control.sock');
      expect(
        JSON.parse(
          await request(path, JSON.stringify({ op: 'freeze', main_sha: 'a'.repeat(40), run_id: '123' }) + '\n'),
        ).ok,
      ).toBe(true);
      expect(JSON.parse(await request(path, '{"op":"shell"}\n')).ok).toBe(false);
      expect(JSON.parse(await request(path, 'x'.repeat(1025))).ok).toBe(false);
      await expect(listenControlSocket(control)).rejects.toThrow('control_socket_exists');
      expect(
        JSON.parse(
          await request(path, JSON.stringify({ op: 'status', main_sha: 'a'.repeat(40), run_id: '123' }) + '\n'),
        ).ok,
      ).toBe(true);
    } finally {
      await server.close();
    }
  });
  it.each([
    ['control_busy', 'control_busy'],
    ['identity_mismatch', 'control_rejected'],
  ])('answers a command rejected with %s as %s', async (message, expected) => {
    const { base, control } = await setup();
    vi.spyOn(control, 'command').mockRejectedValue(new Error(message));
    const server = await listenControlSocket(control);
    try {
      const response = JSON.parse(
        await request(
          join(base, 'control.sock'),
          JSON.stringify({ op: 'status', main_sha: 'a'.repeat(40), run_id: '123' }) + '\n',
        ),
      );
      expect(response).toEqual({ ok: false, error: expected });
    } finally {
      await server.close();
    }
  });
  it.each([
    ['source_estimate_failed:estimate-query', { ok: false, error: 'control_rejected', detail: 'estimate-query' }],
    ['source_estimate_failed:estimate-limit', { ok: false, error: 'control_rejected', detail: 'estimate-limit' }],
    ['source_estimate_failed:estimate-secret', { ok: false, error: 'control_rejected' }],
    ['source_estimate_failed:', { ok: false, error: 'control_rejected' }],
    ['source_estimate_failed', { ok: false, error: 'control_rejected' }],
    ['relation "articles" does not exist', { ok: false, error: 'control_rejected' }],
    ['identity_mismatch:estimate-query', { ok: false, error: 'control_rejected' }],
  ])('answers a command rejected with %j as %j', async (message, expected) => {
    const { base, control } = await setup();
    vi.spyOn(control, 'command').mockRejectedValue(new Error(message));
    const server = await listenControlSocket(control);
    try {
      const response = JSON.parse(
        await request(
          join(base, 'control.sock'),
          JSON.stringify({ op: 'estimate', main_sha: 'a'.repeat(40), run_id: '123' }) + '\n',
        ),
      );
      expect(response).toEqual(expected);
    } finally {
      await server.close();
    }
  });
  it('never removes an unrelated file and rejects public directories and symlinks', async () => {
    const { base, control, queue } = await setup();
    const path = join(base, 'control.sock');
    await writeFile(path, 'keep');
    await expect(listenControlSocket(control)).rejects.toThrow();
    expect(await readFile(path, 'utf8')).toBe('keep');
    await chmod(base, 0o755);
    await expect(SourceControl.open({ base, queue })).rejects.toThrow();
    await chmod(base, 0o700);
    const link = base + '-link';
    dirs.push(link);
    await symlink(base, link);
    await expect(SourceControl.open({ base: link, queue })).rejects.toThrow();
  });
  it('can restart after graceful close removes only its owned socket', async () => {
    const { control } = await setup();
    const first = await listenControlSocket(control);
    await first.close();
    const next = await listenControlSocket(control);
    await next.close();
  });

  it('refuses to unlink a different inode during graceful close', async () => {
    const { control, base } = await setup();
    const owner = await listenControlSocket(control);
    const path = join(base, 'control.sock');
    const moved = join(base, 'moved.sock');
    await rename(path, moved);
    await writeFile(path, 'keep');
    try {
      await expect(owner.close()).rejects.toThrow('control_socket_changed');
      expect(await readFile(path, 'utf8')).toBe('keep');
    } finally {
      await rm(path);
      await rename(moved, path);
      await owner.close();
    }
  });
  it('creates the socket with mode 0600 before any chmod and restores the umask', async () => {
    const { control, base } = await setup();
    const before = process.umask(0o022);
    skipChmod.value = true;
    try {
      const owner = await listenControlSocket(control);
      try {
        expect((await lstat(join(base, 'control.sock'))).mode & 0o777).toBe(0o600);
        expect(process.umask()).toBe(0o022);
      } finally {
        await owner.close();
      }
    } finally {
      skipChmod.value = false;
      process.umask(before);
    }
  });
  it('restores the umask when listen fails', async () => {
    const { base, queue } = await setup();
    let deep = base;
    while (join(deep, 'control.sock').length <= 120) {
      deep = join(deep, 'd'.repeat(40));
      await mkdir(deep, { mode: 0o700 });
    }
    const control = await SourceControl.open({ base: deep, queue, revision: 'a'.repeat(40) });
    const before = process.umask(0o022);
    try {
      await expect(listenControlSocket(control)).rejects.toMatchObject({
        code: expect.stringMatching(/^(?:ENAMETOOLONG|EINVAL)$/),
      });
      expect(process.umask()).toBe(0o022);
    } finally {
      process.umask(before);
    }
  });

  describe('stale socket recovery', () => {
    it('removes a stale socket left by a killed owner and starts', async () => {
      const { control, base } = await setup();
      const path = join(base, 'control.sock');
      await leaveStaleSocket(path);
      expect((await lstat(path)).isSocket()).toBe(true);
      const owner = await listenControlSocket(control);
      try {
        expect(JSON.parse(await request(path, '{"op":"shell"}\n')).ok).toBe(false);
      } finally {
        await owner.close();
      }
    });
    it('refuses a socket with a live owner and leaves it in place', async () => {
      const { control, base } = await setup();
      const path = join(base, 'control.sock');
      const live = createServer((socket) => socket.on('error', () => {}));
      await new Promise<void>((resolve) => live.listen(path, resolve));
      await chmod(path, 0o600);
      try {
        const before = await lstat(path);
        await expect(listenControlSocket(control)).rejects.toThrow('control_socket_exists');
        expect((await lstat(path)).ino).toBe(before.ino);
      } finally {
        await new Promise((resolve) => live.close(resolve));
      }
    });
    it('keeps a symbolic link and its target', async () => {
      const { control, base } = await setup();
      const path = join(base, 'control.sock');
      const target = join(base, 'target');
      await writeFile(target, 'keep');
      await symlink(target, path);
      await expect(listenControlSocket(control)).rejects.toThrow('control_socket_exists');
      expect((await lstat(path)).isSymbolicLink()).toBe(true);
      expect(await readFile(target, 'utf8')).toBe('keep');
    });
    it('keeps a stale socket whose mode is not 0600', async () => {
      const { control, base } = await setup();
      const path = join(base, 'control.sock');
      await leaveStaleSocket(path, 0o644);
      await expect(listenControlSocket(control)).rejects.toThrow('control_socket_exists');
      expect((await lstat(path)).isSocket()).toBe(true);
    });
    it('keeps the socket when the inode changes between the two inspections', async () => {
      const { base } = await setup();
      const path = join(base, 'control.sock');
      await leaveStaleSocket(path);
      let calls = 0;
      const inspect = (async (target: string) => {
        const stat = await lstat(target);
        return calls++ === 0 ? stat : { isSocket: () => true, dev: stat.dev, ino: stat.ino + 1 };
      }) as unknown as typeof lstat;
      await expect(removeStaleControlSocket(path, { lstat: inspect })).rejects.toThrow('control_socket_exists');
      expect(calls).toBe(2);
      expect((await lstat(path)).isSocket()).toBe(true);
    });
  });

  describe('forceClose', () => {
    it('removes only its own socket without waiting for connections', async () => {
      const { control, base } = await setup();
      const owner = await listenControlSocket(control);
      expect(owner.forceClose()).toBe(true);
      await expect(lstat(join(base, 'control.sock'))).rejects.toMatchObject({ code: 'ENOENT' });
    });
    it('keeps a socket that replaced its own', async () => {
      const { control, base } = await setup();
      const owner = await listenControlSocket(control);
      const path = join(base, 'control.sock');
      const moved = join(base, 'moved.sock');
      await rename(path, moved);
      await writeFile(path, 'keep');
      try {
        expect(owner.forceClose()).toBe(false);
        expect(await readFile(path, 'utf8')).toBe('keep');
      } finally {
        await rm(path);
        await rename(moved, path);
        await owner.close();
      }
    });
  });
});
