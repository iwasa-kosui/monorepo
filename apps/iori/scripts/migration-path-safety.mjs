import { execFileSync } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
let cachedRepositoryRoot;
const repositoryRoot = () => {
  if (cachedRepositoryRoot === undefined) {
    cachedRepositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: scriptDirectory,
      encoding: 'utf8',
    }).trim();
  }
  return cachedRepositoryRoot;
};

const isWithin = (candidate, parent) => {
  const path = relative(parent, candidate);
  return path === ''
    || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
};

const closestExistingPath = async (path) => {
  let current = path;
  while (true) {
    try {
      await lstat(current);
      return current;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
};

const rejectSymlinkComponents = async (path) => {
  let current = path;
  while (true) {
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new Error('Migration path must not include a symlink.');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
};

const assertOutsideRepository = async (path) => {
  const [realRepositoryRoot, existingPath] = await Promise.all([
    realpath(repositoryRoot()),
    closestExistingPath(path),
  ]);
  const realExistingPath = await realpath(existingPath);
  if (isWithin(realExistingPath, realRepositoryRoot)) {
    throw new Error('Migration data must be outside the repository.');
  }
};

export const assertExternalMigrationPath = async (path) => {
  const resolved = resolve(path);
  await rejectSymlinkComponents(resolved);
  await assertOutsideRepository(resolved);
  return resolved;
};

export const assertExternalMigrationRoot = async (root) => {
  if (typeof root !== 'string' || root.length === 0 || !isAbsolute(root)) throw new Error('Invalid migration root.');
  const resolved = await assertExternalMigrationPath(root);
  const metadata = await lstat(resolved);
  if (!metadata.isDirectory() || (metadata.mode & 0o077) !== 0) throw new Error('Invalid migration root.');
  return resolved;
};
