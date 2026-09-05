import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname } from 'node:path';

export const openSourceFile = async (path: string, maxBytes: number, privateFile = true) => {
  if (await realpath(dirname(path)) !== dirname(path)) throw new Error('unsafe_file');
  const before = await lstat(path);
  if (
    !before.isFile() || before.size > maxBytes || before.uid !== process.getuid?.()
    || (privateFile && (before.mode & 0o777) !== 0o600)
  ) throw new Error('unsafe_file');
  // A regular file may be replaced after lstat; never block opening a replacement FIFO.
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() || stat.size > maxBytes || stat.size !== before.size
      || stat.dev !== before.dev || stat.ino !== before.ino || stat.uid !== before.uid
      || (privateFile && (stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600))
    ) throw new Error('unsafe_file');
    return { file, stat };
  } catch (error) {
    await file.close();
    throw error;
  }
};
