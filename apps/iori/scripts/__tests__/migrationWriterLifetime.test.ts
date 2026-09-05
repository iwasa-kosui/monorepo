import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { migrationSourceFixture } from './migrationSourceFixture.js';
const exec = promisify(execFile);
it.each(['delayed-error', 'oversized-row'])('captures writer failure and waits cleanup (%s)', async mode => {
  const fixture = await migrationSourceFixture({
    posts: [{ content: 'a' }, { content: mode === 'oversized-row' ? 'z'.repeat(100000) : 'b' }],
  });
  const script = join(fixture.root, 'writer.mjs');
  const converter = new URL('../convert-d1-import.mjs', import.meta.url).href;
  const schema = fileURLToPath(new URL('../../drizzle-d1/0000_boring_xavin.sql', import.meta.url));
  await writeFile(
    script,
    `
    import fs from 'node:fs';
    import { EventEmitter } from 'node:events';
    import { syncBuiltinESMExports } from 'node:module';
    let closed = false; let destroyed = false; let emitted = false;
    class Writer extends EventEmitter {
      write() { if (process.argv[2] === 'delayed-error' && !emitted) { emitted = true; setImmediate(() => this.emit('error', new Error('fixture delayed write'))); } return true; }
      end() { setTimeout(() => { closed = true; this.emit('close'); }, 50); }
      destroy() { destroyed = true; setTimeout(() => { closed = true; this.emit('close'); }, 50); }
    }
    fs.createWriteStream = () => new Writer(); syncBuiltinESMExports();
    process.on('uncaughtException', () => { process.stdout.write(JSON.stringify({ uncaught: true }) + '\\n'); process.exitCode = 1; });
    const { convertD1Import } = await import(process.argv[3]);
    try { await convertD1Import({ manifestPath: process.argv[4], schemaPath: process.argv[5], outputDir: process.argv[6] }); process.stdout.write(JSON.stringify({ caught: false }) + '\\n'); }
    catch { process.stdout.write(JSON.stringify({ caught: true, closed, destroyed }) + '\\n'); }
  `,
    { mode: 0o600 },
  );
  try {
    const { stdout } = await exec(process.execPath, [
      script,
      mode,
      converter,
      fixture.manifestPath,
      schema,
      join(fixture.root, 'sql'),
    ], { timeout: 5000 });
    expect(JSON.parse(stdout.trim())).toMatchObject({ caught: true, closed: true, destroyed: true });
    await expect(readFile(join(fixture.root, 'sql/d1-import-manifest.json'))).rejects.toThrow();
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
