import { lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const fail = () => {
  throw new Error('Source deployment is blocked.');
};
// Read-only bootstrap check: never depend on the currently deployed client or parse marker contents.
export const assertSourceDeployAllowed = async ({ home, uid }, fs = { lstat, realpath }) => {
  if (!Number.isSafeInteger(uid) || uid < 0 || typeof home !== 'string' || resolve(home) !== home) fail();
  const base = join(home, '.iori-migration');
  const directory = async (path, privateMode) => {
    try {
      const stat = await fs.lstat(path);
      if (
        !stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid
        || (privateMode ? (stat.mode & 0o777) !== 0o700 : (stat.mode & 0o022) !== 0)
        || await fs.realpath(path) !== path
      ) fail();
      return stat;
    } catch (error) {
      if (privateMode && error.code === 'ENOENT') return null;
      fail();
    }
  };
  const beforeHome = await directory(home, false);
  const before = await directory(base, true);
  for (const name of ['freeze.json', 'freeze.pending']) {
    try {
      await fs.lstat(join(base, name));
      fail();
    } catch (error) {
      if (error.code !== 'ENOENT') fail();
    }
  }
  const after = await directory(base, true);
  const afterHome = await directory(home, false);
  if (
    before?.dev !== after?.dev || before?.ino !== after?.ino
    || beforeHome.dev !== afterHome.dev || beforeHome.ino !== afterHome.ino
  ) fail();
};
