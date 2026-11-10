import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { assertExternalMigrationPath } from './migration-path-safety.mjs';
export const privateHandle = async (path) => {
  await assertExternalMigrationPath(path);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o077) !== 0) {
      throw new Error('Invalid private migration file.');
    }
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
};
export const readPrivateBounded = async (path, limit, signal) => {
  const handle = await privateHandle(path);
  try {
    if ((await handle.stat()).size > limit) throw new Error('Migration file exceeds bound.');
    signal?.throwIfAborted();
    const body = await handle.readFile({ signal });
    if (body.length > limit) throw new Error('Migration file exceeds bound.');
    return body;
  } finally {
    await handle.close();
  }
};
