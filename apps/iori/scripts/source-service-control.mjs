import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

import { sourceIdentitySchema } from './source-transfer-protocol.mjs';

const markerLimitBytes = 1024;
export const absent = async (path) => {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    throw error;
  }
};
export const readSourceMarker = async (
  path,
  uid,
  schema = sourceIdentitySchema,
  message = 'Source pending freeze is invalid.',
) => {
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.uid !== uid || before.size > markerLimitBytes) throw new Error();
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await file.stat();
      if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw new Error();
      const buffer = Buffer.alloc(markerLimitBytes + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > markerLimitBytes) throw new Error();
      const identity = schema.parse(JSON.parse(buffer.toString('utf8', 0, bytesRead)));
      return { before, identity };
    } finally {
      await file.close();
    }
  } catch {
    throw new Error(message);
  }
};
export const createSourceServiceControl = ({ home, uid, guard, runCommand, signal, captureOutput }) => {
  const check = async () => {
    signal?.throwIfAborted();
    await guard({ home, uid });
  };
  const exec = (program, args, capture = captureOutput) =>
    runCommand(program, args, {
      cwd: home,
      env: { ...process.env, PATH: '/usr/bin:/bin' },
      timeout: 5 * 60_000,
      maxBuffer: 8_000_000,
      signal,
      captureOutput: capture,
    });
  let systemctl = '';
  const service = async (action, message) => {
    await check();
    try {
      await exec('sudo', ['-n', systemctl, action, 'microblog']);
    } catch {
      signal?.throwIfAborted();
      throw new Error(message);
    }
  };
  const assertServiceControl = async () => {
    try {
      await exec('/bin/sh', ['-c', 'command -v systemctl'], async (result) => {
        systemctl = result.stdout.trim();
        await captureOutput?.(result);
      });
      if (!/^\/[A-Za-z0-9/_.-]+$/.test(systemctl)) throw new Error();
      await exec('sudo', ['-n', '-l', systemctl, 'stop', 'microblog']);
      await exec('sudo', ['-n', '-l', systemctl, 'start', 'microblog']);
    } catch {
      signal?.throwIfAborted();
      throw new Error('Source service control is not permitted.');
    }
  };
  const readServiceState = async () => {
    let state = '';
    await exec(systemctl, ['is-active', 'microblog'], async (result) => {
      state = result.stdout.trim();
      await captureOutput?.(result);
    }).catch(() => {});
    signal?.throwIfAborted();
    return state;
  };
  return { check, service, assertServiceControl, readServiceState };
};
