import { access, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

import { runInfrastructureCommand } from '../infrastructure-command.mjs';
import { runMigrationCommand } from '../migration-command.mjs';
import { createFixtureDirectory } from './fixtureTemp.ts';
it('streams bounded bootstrap input to the owned child without shell evaluation', async () => {
  const result = await runMigrationCommand(process.execPath, [
    '-e',
    'process.stdin.setEncoding("utf8");let value="";process.stdin.on("data",chunk=>value+=chunk);process.stdin.on("end",()=>process.stdout.write(value));',
  ], {
    cwd: process.cwd(),
    env: process.env,
    timeout: 5000,
    maxBuffer: 1024,
    input: 'synthetic bootstrap bytes',
  });
  expect(result.stdout).toBe('synthetic bootstrap bytes');
});
it.each(['direct', 'pnpm', 'infrastructure'])('awaits actual process group cleanup after abort (%s)', async mode => {
  const root = await createFixtureDirectory('iori-command-fixture-');
  const ready = join(root, 'ready');
  const marker = join(root, 'closed');
  const controller = new AbortController();
  const source =
    'const fs=require(\'node:fs\');process.on(\'SIGTERM\',()=>setTimeout(()=>{fs.writeFileSync(process.argv[2],\'term\');process.exit(0)},50));fs.writeFileSync(process.argv[1],\'ready\');setTimeout(()=>{fs.writeFileSync(process.argv[2],\'fallback\');process.exit(0)},1500);';
  const args = ['-e', source, ready, marker];
  const pending = (mode === 'infrastructure' ? runInfrastructureCommand : runMigrationCommand)(
    mode === 'pnpm' ? 'pnpm' : process.execPath,
    mode === 'pnpm' ? ['exec', process.execPath, ...args] : args,
    {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      env: process.env,
      timeout: 5000,
      maxBuffer: 1024,
      signal: controller.signal,
    },
  );
  const result = pending.catch(error => error);
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await access(ready);
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    await access(ready);
    controller.abort();
    expect(await result).toBeInstanceOf(Error);
    expect(await readFile(marker, 'utf8')).toBe('term');
  } finally {
    controller.abort();
    await result;
    await rm(root, { recursive: true, force: true });
  }
});
