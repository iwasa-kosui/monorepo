import { expect, it } from 'vitest';
import { runMigrationCommand } from '../migration-command.mjs';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
it('awaits real child cleanup and close after abort', async () => {
  const root = await mkdtemp('/private/tmp/iori-command-fixture-');
  const ready = join(root, 'ready');
  const marker = join(root, 'closed');
  const controller = new AbortController();
  const source =
    'const fs=require(\'node:fs\');process.on(\'SIGTERM\',()=>setTimeout(()=>{fs.writeFileSync(process.argv[2],\'done\');process.exit(0)},50));fs.writeFileSync(process.argv[1],\'ready\');setInterval(()=>{},1000);';
  const pending = runMigrationCommand(process.execPath, ['-e', source, ready, marker], {
    cwd: root,
    env: process.env,
    timeout: 5000,
    maxBuffer: 1024,
    signal: controller.signal,
  });
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
    expect(await readFile(marker, 'utf8')).toBe('done');
  } finally {
    controller.abort();
    await result;
    await rm(root, { recursive: true, force: true });
  }
});
