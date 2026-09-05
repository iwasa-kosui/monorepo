import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';

import { canonicalRowSummary, sortedCanonicalRecords } from '../canonical-row-sort.mjs';
import { APPLICATION_TABLE_ORDER, exportPostgres } from '../export-postgres.mjs';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
const root = async () => {
  const path = await mkdtemp('/private/tmp/iori-snapshot-');
  roots.push(path);
  return path;
};
it('loads bundled source snapshot code without executing an export CLI entrypoint', async () => {
  const output = join(await root(), 'index.mjs');
  await build({
    stdin: {
      contents: `import { SourceSnapshot } from ${
        JSON.stringify(new URL('../../src/adaptor/node/source/sourceSnapshot.ts', import.meta.url).pathname)
      }; console.log(typeof SourceSnapshot);`,
      resolveDir: process.cwd(),
    },
    outfile: output,
    platform: 'node',
    format: 'esm',
    bundle: true,
  });
  const result = await promisify(execFile)(process.execPath, [output]);
  expect(result.stdout.trim()).toBe('function');
  expect(result.stderr).toBe('');
});
it('rejects oversized/partial exports and connection-close failure without a complete manifest', async () => {
  for (const failure of ['size', 'query', 'end']) {
    const outputDir = join(await root(), 'export');
    let table = '';
    let sent = false;
    await expect(exportPostgres({
      outputDir,
      maxBytes: failure === 'size' ? 1 : undefined,
      createClient: async () => ({
        connect: async () => {},
        end: async () => {
          if (failure === 'end') throw new Error('end_failed');
        },
        query: async (sql) => {
          if (sql.startsWith('DECLARE')) {
            table = sql.includes('"actors"') ? 'actors' : '';
            sent = false;
          }
          if (sql.startsWith('FETCH') && table === 'actors' && !sent) {
            sent = true;
            if (failure === 'query') throw new Error('query_failed');
            return { rows: [{ row: { value: 'fixture' } }] };
          }
          return { rows: [] };
        },
      }),
    })).rejects.toThrow();
    await expect(readFile(join(outputDir, 'export-manifest.json'))).rejects.toThrow();
  }
});
it('sorts by canonical key across bounded runs while retaining exact original JSON payload', async () => {
  const records = [{ key: 'z', payload: '{"original":"z"}' }, { key: 'a', payload: '{"original":"a"}' }, {
    key: '😀',
    payload: '{"original":"emoji"}',
  }];
  const actual = [];
  for await (const record of sortedCanonicalRecords(records, { chunkBytes: 1 })) actual.push(record);
  expect(actual).toEqual([records[1], records[0], records[2]]);
  expect(await canonicalRowSummary(records.map(({ key }) => key), { chunkBytes: 1 })).toMatchObject({ count: 3 });
});
it.each([false, true])(
  'exports cursor pages inside one read-only snapshot and publishes only after commit (fail: %s)',
  async (failCommit) => {
    const outputDir = join(await root(), 'export');
    const sqls: string[] = [];
    let table = '';
    let page = 0;
    let ended = false;
    const operation = exportPostgres({
      outputDir,
      pageSize: 1,
      sortChunkBytes: 1,
      createClient: async () => ({
        connect: async () => {},
        end: async () => {
          ended = true;
        },
        query: async (sql: string) => {
          sqls.push(sql);
          if (sql.startsWith('DECLARE')) {
            table = APPLICATION_TABLE_ORDER.find((name) => sql.includes(`"${name}"`))!;
            page = 0;
          }
          if (sql.startsWith('FETCH') && table === 'posts' && page++ < 2) {
            return { rows: [{ row: { content: page === 1 ? 'z' : 'a' } }] };
          }
          if (sql === 'COMMIT') {
            await expect(readFile(join(outputDir, 'export-manifest.json'))).rejects.toThrow();
            if (failCommit) throw new Error('commit_failed');
          }
          return { rows: [] };
        },
      }),
    });
    if (failCommit) {
      await expect(operation).rejects.toThrow();
      await expect(readFile(join(outputDir, 'export-manifest.json'))).rejects.toThrow();
      expect(sqls.at(-1)).toBe('ROLLBACK');
    } else {
      expect((await operation).complete).toBe(true);
      expect(await readFile(join(outputDir, 'posts.ndjson'), 'utf8')).toBe('{"content":"a"}\n{"content":"z"}\n');
      expect(sqls.at(-1)).toBe('COMMIT');
    }
    expect(sqls[0]).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(ended).toBe(true);
  },
);
