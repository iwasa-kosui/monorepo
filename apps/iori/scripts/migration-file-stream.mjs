import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { assertExternalMigrationPath } from './migration-path-safety.mjs';
export const RECORD_BYTES = 8 * 1024 * 1024;
export const METADATA_BYTES = 16 * 1024 * 1024;
export const OBJECT_BYTES = 32 * 1024 * 1024;
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
export const privateLines = async function*(path, { signal, maxBytes = RECORD_BYTES } = {}) {
  const handle = await privateHandle(path);
  let pending = Buffer.alloc(0);
  try {
    const stream = handle.createReadStream({ autoClose: false, highWaterMark: 64 * 1024, signal });
    for await (const chunk of stream) {
      signal?.throwIfAborted();
      pending = Buffer.concat([pending, chunk]);
      let offset;
      while ((offset = pending.indexOf(10)) !== -1) {
        if (offset > maxBytes) throw new Error('Migration record exceeds bound.');
        const line = pending.subarray(0, offset).toString('utf8');
        pending = pending.subarray(offset + 1);
        if (line) yield line;
      }
      if (pending.length > maxBytes) throw new Error('Migration record exceeds bound.');
    }
    if (pending.length) throw new Error('Migration record is truncated.');
  } finally {
    await handle.close();
  }
};
export const privateFileHash = async (path, signal) => {
  const handle = await privateHandle(path);
  const hash = createHash('sha256');
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false, signal })) hash.update(chunk);
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
};
export const verifiedTableRows = async function*({ path, descriptor, signal }) {
  if (
    !Number.isSafeInteger(descriptor?.count) || descriptor.count < 0
    || !/^[a-f0-9]{64}$/.test(descriptor.checksum ?? '')
  ) throw new Error('Invalid table descriptor.');
  if (await privateFileHash(path, signal) !== descriptor.checksum) throw new Error('Table checksum mismatch.');
  let count = 0;
  for await (const _line of privateLines(path, { signal })) count++;
  if (count !== descriptor.count) throw new Error('Table count mismatch.');
  for await (const line of privateLines(path, { signal })) {
    const row = JSON.parse(line);
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid table row.');
    yield row;
  }
};
