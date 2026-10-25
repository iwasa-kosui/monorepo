import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { runMigrationCommand } from '../migration-command.mjs';
import { createFixtureDirectory } from './fixtureTemp.ts';

it.each([false, true])(
  'forwards outer termination and awaits nested owned child cleanup (ignores TERM: %s)',
  async (ignore) => {
    const root = await createFixtureDirectory('iori-nested-');
    const ready = join(root, 'ready');
    const settled = join(root, 'settled');
    const wrapper = join(root, 'wrapper.mjs');
    const childCode = `const fs=require('node:fs');
    process.on('SIGTERM',()=>{ ${ignore ? '' : 'setTimeout(()=>process.exit(0),30);'} });
    fs.writeFileSync(${JSON.stringify(ready)},'ready');setTimeout(()=>process.exit(0),2000);`;
    await writeFile(
      wrapper,
      `
    import {withCliSignal} from ${JSON.stringify(new URL('../cli-lifetime.mjs', import.meta.url).href)};
    import {runMigrationCommand} from ${JSON.stringify(new URL('../migration-command.mjs', import.meta.url).href)};
    import {writeFile} from 'node:fs/promises';
    await withCliSignal(async signal=>{
      try { await runMigrationCommand(process.execPath,['-e',${JSON.stringify(childCode)}],
        {cwd:${JSON.stringify(root)},env:process.env,timeout:3000,maxBuffer:1024,signal,killGraceMs:150}); }
      finally { await writeFile(${JSON.stringify(settled)},'closed'); }
    }).catch(()=>{process.exitCode=1;});
  `,
    );
    const abort = new AbortController();
    const pending = runMigrationCommand(process.execPath, [wrapper], {
      cwd: root,
      env: process.env,
      timeout: 5000,
      maxBuffer: 1024,
      signal: abort.signal,
      killGraceMs: 1500,
    }).catch(error => error);
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
      const start = Date.now();
      abort.abort();
      expect(await pending).toBeInstanceOf(Error);
      expect(await readFile(settled, 'utf8')).toBe('closed');
      expect(Date.now() - start).toBeLessThan(1000);
    } finally {
      abort.abort();
      await pending;
      await rm(root, { recursive: true, force: true });
    }
  },
);
