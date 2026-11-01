import { lstatSync, unlinkSync } from 'node:fs';
import { chmod, lstat, unlink } from 'node:fs/promises';
import { connect, createServer } from 'node:net';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { SOURCE_LIMITS } from '../../../../scripts/source-transfer-protocol.mjs';
import { type SourceControl, validatePrivateDirectory } from './sourceControl.ts';

const isMissing = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT';
const PROBE_TIMEOUT_MS = 1000;
const probeSocket = (path: string) =>
  new Promise<'refused' | 'missing' | 'other'>((resolve) => {
    const socket = connect(path);
    const finish = (result: 'refused' | 'missing' | 'other') => {
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish('other'), PROBE_TIMEOUT_MS);
    socket.once('connect', () => finish('other'));
    socket.once('error', (error: NodeJS.ErrnoException) =>
      finish(error.code === 'ECONNREFUSED' ? 'refused' : error.code === 'ENOENT' ? 'missing' : 'other'));
  });
// A stale socket is removed only after a refused connect proves no owner is listening.
export async function removeStaleControlSocket(path: string, { lstat: inspect = lstat } = {}) {
  let first;
  try {
    first = await inspect(path);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  if (!first.isSocket() || first.uid !== process.getuid?.() || (first.mode & 0o777) !== 0o600) {
    throw new Error('control_socket_exists');
  }
  const probe = await probeSocket(path);
  if (probe === 'missing') return;
  if (probe !== 'refused') throw new Error('control_socket_exists');
  let second;
  try {
    second = await inspect(path);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  if (!second.isSocket() || second.dev !== first.dev || second.ino !== first.ino) {
    throw new Error('control_socket_exists');
  }
  try {
    await unlink(path);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

export async function listenControlSocket(control: SourceControl) {
  await validatePrivateDirectory(control.base);
  const path = join(control.base, 'control.sock');
  await removeStaleControlSocket(path);
  let ready = false;
  const server = createServer((socket) => {
    const abort = new AbortController();
    socket.once('close', () => abort.abort());
    let streaming = false;
    let input = Buffer.alloc(0);
    let received = false;
    const inputDeadline = setTimeout(() => socket.destroy(), 5000);
    socket.once('close', () => clearTimeout(inputDeadline));
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
      clearTimeout(inputDeadline);
      socket.setTimeout(SOURCE_LIMITS.socketMs);
      const deadline = setTimeout(() => {
        abort.abort();
        socket.destroy();
      }, SOURCE_LIMITS.socketMs);
      socket.once('close', () => clearTimeout(deadline));
      let command: unknown;
      try {
        command = JSON.parse(input.toString('utf8'));
      } catch {
        socket.end('{"ok":false,"error":"invalid_command"}\n');
        return;
      }
      control.command(command, {
        signal: abort.signal,
        sendFile: async (metadata, stream) => {
          streaming = true;
          socket.write(JSON.stringify({ ok: true, file: metadata }) + '\n');
          await pipeline(stream, socket, { end: false, signal: abort.signal });
        },
      }).then(
        (state) => {
          if (streaming) socket.end();
          else socket.end(JSON.stringify({ ok: true, state }) + '\n');
        },
        () => {
          if (streaming) socket.destroy();
          else socket.end('{"ok":false,"error":"control_rejected"}\n');
        },
      );
    });
  });
  const previousUmask = process.umask(0o177);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(path, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  } finally {
    process.umask(previousUmask);
  }
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
    forceClose: () => {
      try {
        const current = lstatSync(path);
        if (
          !current.isSocket() || current.ino !== owned.ino || current.dev !== owned.dev || current.uid !== owned.uid
        ) {
          return false;
        }
        unlinkSync(path);
        server.close();
        return true;
      } catch {
        return false;
      }
    },
  };
}
