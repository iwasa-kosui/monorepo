import { lstat, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { runInfrastructureCommand } from '../infrastructure-command.mjs';
import { runMigrationCommand } from '../migration-command.mjs';
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

it.each([0, 1])('retains remote source child diagnostics privately with exit %s and fixed stdout', async code => {
  const root = await createFixtureDirectory('iori-remote-log-');
  try {
    const script = `
      import * as source from './scripts/source-deploy-operations.mjs';
      import {runMigrationCommand} from './scripts/migration-command.mjs';
      delete process.env.IORI_PRIVATE_LOG_DIRECTORY;
      try {
        await source.runSourceDeployStep({phase:'dependencies',sha:'a'.repeat(40)}, {
          home:'/fixture', guard:async()=>{}, inspectCheckout:async()=>{}, inspectPnpm:async()=>{},
          captureOutput:source.captureSourceCommandOutput,
          runCommand:async (program,args,options)=> {
            const stdout=args.includes('rev-parse')?'a'.repeat(40):args.includes('--version')?'10.12.4':'';
            return runMigrationCommand(process.execPath,['-e',
              'process.stdout.write('+JSON.stringify(stdout)+');process.stderr.write("remote synthetic diagnostic");process.exitCode='+${code}],
              {...options,cwd:process.cwd()});
          }
        });
        process.stdout.write('Source operation completed.');
      } catch { process.stdout.write('Source operation failed.'); process.exitCode=1; }
    `;
    const operation = runMigrationCommand(process.execPath, ['--input-type=module', '-e', script], {
      cwd: process.cwd(),
      env: { ...process.env, IORI_PRIVATE_LOG_DIRECTORY: root },
      timeout: 10_000,
      maxBuffer: 100_000,
    });
    if (code) await expect(operation).rejects.toThrow(/^Migration command failed; outcome may be uncertain\.$/);
    else expect((await operation).stdout).toBe('Source operation completed.');
    const files = await readdir(root);
    expect(files).toHaveLength(1);
    const diagnostic = await readFile(join(root, files[0]!), 'utf8');
    expect(diagnostic).toContain('remote synthetic diagnostic');
    expect(diagnostic).toContain(code ? 'Source operation failed.' : 'Source operation completed.');
    if (!code) expect(diagnostic).toContain('a'.repeat(40));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
