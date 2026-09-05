import { randomUUID } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
export const createPrivateCommandLog = async (directory) => {
  const stat = await lstat(directory);
  if (
    !stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700
    || await realpath(directory) !== directory
  ) throw new Error('Private diagnostic directory is invalid.');
  const handle = await open(join(directory, `command-${randomUUID()}.log`), 'wx', 0o600);
  return {
    capture: async ({ stdout, stderr }) => {
      await handle.writeFile(Buffer.from(`${stdout}\n${stderr}`).subarray(0, 8_000_001));
    },
    close: () => handle.close(),
  };
};
