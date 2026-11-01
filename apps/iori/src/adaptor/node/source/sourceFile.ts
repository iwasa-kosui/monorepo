import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname } from 'node:path';

export type SourceFileFailure = 'missing' | 'access' | 'owner' | 'not-regular' | 'too-large' | 'other';

const unsafe = (reason: SourceFileFailure) => Object.assign(new Error('unsafe_file'), { reason });
const classify = (error: unknown, absentIsMissing: boolean): SourceFileFailure => {
  const code = (error as NodeJS.ErrnoException | null | undefined)?.code;
  if (absentIsMissing && (code === 'ENOENT' || code === 'ENOTDIR')) return 'missing';
  if (code === 'EACCES' || code === 'EPERM') return 'access';
  return 'other';
};
const attempt = async <T>(run: () => Promise<T>, absentIsMissing = false) => {
  try {
    return await run();
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error('unsafe_file'), {
      reason: classify(error, absentIsMissing),
    });
  }
};

export const openSourceFile = async (path: string, maxBytes: number, privateFile = true) => {
  if (await attempt(() => realpath(dirname(path))) !== dirname(path)) throw unsafe('other');
  const before = await attempt(() => lstat(path), true);
  if (before.uid !== process.getuid?.()) throw unsafe('owner');
  if (!before.isFile()) throw unsafe('not-regular');
  if (before.size > maxBytes) throw unsafe('too-large');
  if (privateFile && (before.mode & 0o777) !== 0o600) throw unsafe('other');
  // A regular file may be replaced after lstat; never block opening a replacement FIFO.
  const file = await attempt(() => open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK));
  try {
    const stat = await attempt(() => file.stat());
    if (stat.uid !== before.uid || (privateFile && stat.uid !== process.getuid?.())) throw unsafe('owner');
    if (!stat.isFile()) throw unsafe('not-regular');
    if (stat.size > maxBytes) throw unsafe('too-large');
    if (
      stat.size !== before.size || stat.dev !== before.dev || stat.ino !== before.ino
      || (privateFile && (stat.mode & 0o777) !== 0o600)
    ) throw unsafe('other');
    return { file, stat };
  } catch (error) {
    await file.close();
    throw error;
  }
};
