import { lstat, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { runInfrastructureCommand } from '../infrastructure-command.mjs';
import { createFixtureDirectory } from './fixtureTemp.js';
it.each([0, 1])('captures bounded private diagnostics before command exit %s settles', async code => {
  const root = await createFixtureDirectory('iori-private-log-');
  try {
    const operation = runInfrastructureCommand(process.execPath, [
      '-e',
      `process.stdout.write('fixture private stdout'); process.stderr.write('fixture private stderr'); process.exitCode=${code}`,
    ], { env: { ...process.env, IORI_PRIVATE_LOG_DIRECTORY: root } });
    if (code) await expect(operation).rejects.toThrow('Migration command failed');
    else await operation;
    const files = await readdir(root);
    expect(files).toHaveLength(1);
    const path = join(root, files[0]!);
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    expect(await readFile(path, 'utf8')).toContain('fixture private stdout');
    expect(await readFile(path, 'utf8')).toContain('fixture private stderr');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
