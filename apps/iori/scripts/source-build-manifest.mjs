import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';

const invalid = () => new Error('Invalid source build closure.');
export const inspectSourceDistDirectory = async (root, uid, create = false) => {
  if (create) {
    try {
      await mkdir(root, { mode: 0o755 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o022) || await realpath(root) !== root) throw invalid();
};
export const validateSourceBuildManifest = (manifest, sha) => {
  if (
    !manifest || manifest.sha !== sha || !/^[a-f0-9]{40}$/.test(sha)
    || !Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > 10000
    || Buffer.byteLength(JSON.stringify(manifest)) > 512 * 1024
  ) throw invalid();
  const names = new Set();
  let bytes = 0;
  for (const file of manifest.files) {
    if (
      !file || typeof file.path !== 'string' || !/^[A-Za-z0-9_./-]{1,512}$/.test(file.path)
      || file.path.split('/').some(part => !part || part === '.' || part === '..') || names.has(file.path)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)
    ) throw invalid();
    names.add(file.path);
    bytes += file.bytes;
    if (bytes > 512 * 1024 ** 2) throw invalid();
  }
  if (!names.has('index.js')) throw invalid();
  return manifest;
};
export const createSourceBuildManifest = async (root, sha, { uid = process.getuid?.(), signal } = {}) => {
  await inspectSourceDistDirectory(root, uid);
  const files = [];
  let bytes = 0;
  let entries = 0;
  const visit = async (relative = '') => {
    signal?.throwIfAborted();
    for (const item of await readdir(join(root, relative), { withFileTypes: true })) {
      if (++entries > 20000) throw invalid();
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (
        !/^[A-Za-z0-9_./-]{1,512}$/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')
      ) throw invalid();
      const path = join(root, name);
      const before = await lstat(path);
      if (before.uid !== uid || (before.mode & 0o022) || before.isSymbolicLink()) throw invalid();
      if (before.isDirectory()) {
        await visit(name);
        continue;
      }
      if (!before.isFile()) throw invalid();
      bytes += before.size;
      if (files.length >= 10000 || bytes > 512 * 1024 ** 2) throw invalid();
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) {
          throw invalid();
        }
        const hash = createHash('sha256');
        const buffer = Buffer.alloc(64 * 1024);
        let count = 0;
        for (;;) {
          signal?.throwIfAborted();
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
          if (!bytesRead) break;
          count += bytesRead;
          if (count > before.size) throw invalid();
          hash.update(buffer.subarray(0, bytesRead));
        }
        const after = await handle.stat();
        if (count !== before.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) {
          throw invalid();
        }
        files.push({ path: name, bytes: count, sha256: hash.digest('hex') });
      } finally {
        await handle.close();
      }
    }
  };
  await visit();
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  signal?.throwIfAborted();
  return validateSourceBuildManifest({ sha, files }, sha);
};
export const verifySourceBuildManifest = async (root, manifest, sha, options) => {
  validateSourceBuildManifest(manifest, sha);
  const actual = await createSourceBuildManifest(root, sha, options);
  const expected = [...manifest.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (JSON.stringify(actual.files) !== JSON.stringify(expected)) throw invalid();
};
