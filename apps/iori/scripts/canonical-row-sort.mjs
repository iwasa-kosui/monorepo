import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { assertExternalMigrationRoot } from './migration-path-safety.mjs';

// Binary compaction keeps at most log2(row count) runs and only two open readers.
export const canonicalRowSummary = async (rows, { chunkBytes = 4 * 1024 * 1024 } = {}) => {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > 4 * 1024 * 1024) {
    throw new Error('Invalid sort bound.');
  }
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'iori-canonical-')));
  let serial = 0;
  const runs = [];
  const lines = async function*(path) {
    const input = createReadStream(path, { encoding: 'utf8', highWaterMark: 16384 });
    const reader = createInterface({ input, crlfDelay: Infinity });
    try {
      for await (const line of reader) yield line;
    } finally {
      reader.close();
      input.destroy();
    }
  };
  const merge = async (left, right) => {
    const path = join(directory, String(serial++));
    const output = await open(path, 'wx', 0o600);
    const a = lines(left);
    const b = lines(right);
    try {
      let x = await a.next();
      let y = await b.next();
      while (!x.done || !y.done) {
        if (y.done || (!x.done && x.value <= y.value)) {
          await output.writeFile(x.value + '\n');
          x = await a.next();
        } else {
          await output.writeFile(y.value + '\n');
          y = await b.next();
        }
      }
    } finally {
      await a.return();
      await b.return();
      await output.close();
    }
    await rm(left);
    await rm(right);
    return path;
  };
  try {
    await assertExternalMigrationRoot(directory);
    let chunk = [];
    let bytes = 0;
    let count = 0;
    const flush = async () => {
      if (!chunk.length) return;
      let path = join(directory, String(serial++));
      const file = await open(path, 'wx', 0o600);
      try {
        await file.writeFile(chunk.sort().join('\n') + '\n');
      } finally {
        await file.close();
      }
      chunk = [];
      bytes = 0;
      let level = 0;
      while (runs[level]) {
        path = await merge(runs[level], path);
        runs[level++] = undefined;
      }
      runs[level] = path;
    };
    for await (const row of rows) {
      if (typeof row !== 'string' || row.includes('\n') || Buffer.byteLength(row) > 8 * 1024 * 1024) {
        throw new Error('Invalid canonical row.');
      }
      chunk.push(row);
      bytes += Buffer.byteLength(row) + 1;
      count++;
      if (bytes >= chunkBytes) await flush();
    }
    await flush();
    let final;
    for (const run of runs) if (run) final = final ? await merge(final, run) : run;
    const hash = createHash('sha256');
    if (final) { for await (const line of lines(final)) hash.update(line + '\n'); }
    return { count, checksum: hash.digest('hex') };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
