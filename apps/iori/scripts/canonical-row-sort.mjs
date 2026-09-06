import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, open, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { assertExternalMigrationRoot } from './migration-path-safety.mjs';

// Binary compaction keeps at most log2(row count) runs and only two open readers.
export const sortedCanonicalRecords = async function*(
  rows,
  { chunkBytes = 4 * 1024 * 1024, spoolParent = tmpdir(), signal } = {},
) {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > 4 * 1024 * 1024) {
    throw new Error('Invalid sort bound.');
  }
  const directory = await realpath(await mkdtemp(join(spoolParent, 'iori-canonical-')));
  let serial = 0;
  const runs = [];
  const lines = async function*(path) {
    const input = createReadStream(path, { encoding: 'utf8', highWaterMark: 16384 });
    const reader = createInterface({ input, crlfDelay: Infinity });
    try {
      for await (const line of reader) {
        signal?.throwIfAborted();
        yield JSON.parse(line);
      }
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
        if (y.done || (!x.done && x.value.key <= y.value.key)) {
          await output.writeFile(JSON.stringify(x.value) + '\n');
          x = await a.next();
        } else {
          await output.writeFile(JSON.stringify(y.value) + '\n');
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
    const flush = async () => {
      if (!chunk.length) return;
      let path = join(directory, String(serial++));
      const file = await open(path, 'wx', 0o600);
      try {
        await file.writeFile(
          chunk.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).map((record) => JSON.stringify(record)).join(
            '\n',
          ) + '\n',
        );
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
      signal?.throwIfAborted();
      if (
        typeof row?.key !== 'string' || typeof row?.payload !== 'string' || row.key.includes('\n')
        || row.payload.includes('\n')
        || Buffer.byteLength(row.key) > 8 * 1024 * 1024 || Buffer.byteLength(row.payload) > 8 * 1024 * 1024
      ) {
        throw new Error('Invalid canonical row.');
      }
      chunk.push(row);
      bytes += Buffer.byteLength(JSON.stringify(row)) + 1;
      if (bytes >= chunkBytes) await flush();
    }
    await flush();
    let final;
    for (const run of runs) if (run) final = final ? await merge(final, run) : run;
    if (final) { for await (const record of lines(final)) yield record; }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

export const canonicalRowSummary = async (rows, options = {}) => {
  const records = async function*() {
    for await (const key of rows) yield { key, payload: key };
  };
  const hash = createHash('sha256');
  let count = 0;
  for await (const { key } of sortedCanonicalRecords(records(), options)) {
    hash.update(key + '\n');
    count++;
  }
  return { count, checksum: hash.digest('hex') };
};
