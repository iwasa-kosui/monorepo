import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { assertExternalMigrationPath } from './migration-path-safety.mjs';
import { parseExpectedTarget, TARGET_BYTES } from './migration-target-contract.mjs';
export const loadExpectedTarget = async (path) => {
  if (typeof path !== 'string' || !path) throw new Error('Independent expected target is required.');
  const absolute = await assertExternalMigrationPath(path);
  const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const metadata = await handle.stat();
    if (
      !metadata.isFile() || metadata.nlink !== 1 || (metadata.mode & 0o077) !== 0 || metadata.size > TARGET_BYTES
      || metadata.size === 0
    ) throw new Error('Invalid target input.');
    return parseExpectedTarget(JSON.parse(await handle.readFile('utf8')));
  } finally {
    await handle.close();
  }
};
