import { lstat, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { assertSourceDeployAllowed } from '../source-deploy-guard.mjs';
import { createFixtureDirectory } from './fixtureTemp.ts';

it('allows prerequisite deployment before control exists without creating a directory', async () => {
  const home = await createFixtureDirectory('iori-guard-');
  try {
    await assertSourceDeployAllowed({ home, uid: (process.getuid?.() ?? -1) });
    await expect(lstat(join(home, '.iori-migration'))).rejects.toThrow();
    await mkdir(join(home, '.iori-migration'), { mode: 0o700 });
    await assertSourceDeployAllowed({ home, uid: (process.getuid?.() ?? -1) });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
it.each(['freeze.json', 'freeze.pending'])('blocks every present marker without parsing %s', async (name) => {
  const home = await createFixtureDirectory('iori-guard-');
  try {
    const base = join(home, '.iori-migration');
    await mkdir(base, { mode: 0o700 });
    await writeFile(join(base, name), 'not-json');
    await expect(assertSourceDeployAllowed({ home, uid: (process.getuid?.() ?? -1) })).rejects.toThrow();
    await rm(join(base, name));
    await symlink('/nonexistent-fixture', join(base, name));
    await expect(assertSourceDeployAllowed({ home, uid: (process.getuid?.() ?? -1) })).rejects.toThrow();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
it('rejects unreadable markers and a replaced private base', async () => {
  const directory = { isDirectory: () => true, isSymbolicLink: () => false, uid: 1, mode: 0o700, dev: 1, ino: 1 };
  for (const failure of ['unreadable', 'replacement']) {
    let calls = 0;
    await expect(assertSourceDeployAllowed({ home: '/fixture', uid: 1 }, {
      realpath: async (path: string) => path,
      lstat: async (path: string) => {
        if (path.endsWith('.json') || path.endsWith('.pending')) {
          throw Object.assign(new Error(), { code: failure === 'unreadable' ? 'EACCES' : 'ENOENT' });
        }
        return { ...directory, ino: failure === 'replacement' && ++calls > 2 ? 2 : 1 };
      },
    })).rejects.toThrow();
  }
});
