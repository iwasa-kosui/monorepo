import { chmod, lstat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { type SourceControl, validatePrivateDirectory } from './sourceControl.ts';

export async function listenControlSocket(control: SourceControl) {
  await validatePrivateDirectory(control.base);
  const path = join(control.base, 'control.sock');
  // Refuse even a stale socket: an operator must verify its owner is dead before removal.
  try {
    await lstat(path);
    throw new Error('control_socket_exists');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  let ready = false;
  const server = createServer((socket) => {
    let input = Buffer.alloc(0);
    let received = false;
    socket.setTimeout(5000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      if (received) return;
      if (!ready || input.length + chunk.length > 1024) {
        received = true;
        socket.end('{"ok":false,"error":"invalid_command"}\n');
        return;
      }
      input = Buffer.concat([input, chunk]);
      if (!input.includes(10)) return;
      received = true;
      socket.setTimeout(310_000);
      let command: unknown;
      try {
        command = JSON.parse(input.toString('utf8'));
      } catch {
        socket.end('{"ok":false,"error":"invalid_command"}\n');
        return;
      }
      control.command(command).then(
        (state) => socket.end(JSON.stringify({ ok: true, state }) + '\n'),
        () => socket.end('{"ok":false,"error":"control_rejected"}\n'),
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  try {
    await chmod(path, 0o600);
    ready = true;
  } catch (error) {
    server.close();
    throw error;
  }
  const owned = await lstat(path);
  return {
    close: async () => {
      const current = await lstat(path);
      if (!current.isSocket() || current.ino !== owned.ino || current.dev !== owned.dev || current.uid !== owned.uid) {
        throw new Error('control_socket_changed');
      }
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
