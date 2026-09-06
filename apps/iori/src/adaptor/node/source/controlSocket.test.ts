import { chmod, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createFixtureDirectory } from '../../../../scripts/__tests__/fixtureTemp.ts';
import { listenControlSocket } from './controlSocket.ts';
import { SourceControl } from './sourceControl.ts';

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
});
