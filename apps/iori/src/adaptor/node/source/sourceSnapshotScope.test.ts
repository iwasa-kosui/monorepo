import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';

import {
  type FixtureRow,
  ids,
  insertStatement,
  scopeFixtureRows,
} from '../../../../scripts/__tests__/exportRowScopeFixture.ts';
import { createFixtureDirectory } from '../../../../scripts/__tests__/fixtureTemp.ts';
import { APPLICATION_TABLE_ORDER, EXPORT_ROW_SCOPE } from '../../../../scripts/export-postgres-lib.mjs';
import { SourceSnapshot } from './sourceSnapshot.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
const schema = await readFile(new URL('../../../../drizzle-d1/0000_boring_xavin.sql', import.meta.url), 'utf8');
const origin = 'https://blog.test';
const identity = { main_sha: 'a'.repeat(40), run_id: 'fixture' };
const uuid = (n: number) => `99999999-9999-4999-8999-${n.toString(16).padStart(12, '0')}`;
const [presentId, missingId, strayMissingId, strayLegacyId] = [uuid(1), uuid(2), uuid(3), uuid(4)];
const imageRow = (n: number, postId: string, url: string): FixtureRow => ({
  imageId: uuid(100 + n),
  postId,
  url,
  createdAt: 1,
});
const images = [
  imageRow(1, ids.myPost, `/uploads/${presentId}.png`),
  imageRow(2, ids.myPost, `/uploads/${missingId}.png`),
  imageRow(3, ids.dPost, 'https://d.example.test/media/1.png'),
  imageRow(4, ids.fPost, `/uploads/${strayMissingId}.png`),
  imageRow(5, ids.fPost, `/static/uploads/${strayLegacyId}.png`),
  imageRow(6, ids.fPost, 'data:image/png;base64,AAAA'),
];

const sqliteOf = (rows: Record<string, FixtureRow[]>) => {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  for (const table of APPLICATION_TABLE_ORDER) {
    for (const row of rows[table] ?? []) {
      const { sql, values } = insertStatement(table, row, () => '?');
      db.prepare(sql).run(...(values as SQLInputValue[]));
    }
  }
  return db;
};

const clientOver = (db: DatabaseSync, statements: string[]) => () => {
  const cursors = new Map<string, Record<string, unknown>[]>();
  return Promise.resolve({
    connect: async () => {},
    end: async () => {},
    query: async (sql: string) => {
      statements.push(sql);
      const table = /^SELECT COALESCE.* FROM "(\w+)" AS row$/.exec(sql)?.[1];
      if (table) return { rows: [db.prepare(`SELECT '0' AS bytes, COUNT(*) AS count FROM "${table}"`).get()!] };
      if (sql.includes('AS owner')) return { rows: [db.prepare(sql.replace('::text', '')).get()!] };
      const declared = /^DECLARE (\w+) NO SCROLL CURSOR FOR (.*)$/s.exec(sql);
      if (declared) {
        const estimate = declared[1] === 'iori_images';
        const select = estimate
          ? declared[2]!.replace('jsonb_build_object(', 'json_object(').replace('left(url, 128)', 'substr(url, 1, 128)')
          : declared[2]!.replace(/^SELECT CASE .* END AS row FROM/s, 'SELECT * FROM');
        const rows = db.prepare(select).all();
        cursors.set(
          declared[1]!,
          estimate ? rows.map((row) => ({ row: JSON.parse(row.row as string) })) : rows.map((row) => ({ row })),
        );
        return { rows: [] };
      }
      const fetched = /^FETCH FORWARD (\d+) FROM (\w+)$/.exec(sql);
      if (fetched) return { rows: cursors.get(fetched[2]!)?.splice(0, Number(fetched[1])) ?? [] };
      return { rows: [] };
    },
  });
};

const snapshotOver = async (db: DatabaseSync, statements: string[] = []) => {
  const base = await createFixtureDirectory('iori-source-scope-');
  roots.push(base);
  const uploadDir = join(base, 'originals');
  await mkdir(uploadDir);
  await writeFile(join(uploadDir, `${presentId}.png`), 'image');
  await mkdir(join(base, 'exports'), { mode: 0o700 });
  return new SourceSnapshot({ base, uploadDir, origin, createClient: clientOver(db, statements) });
};

it('counts only the images the export keeps, so estimate and export agree on the missing uploads', async () => {
  const db = sqliteOf({ ...scopeFixtureRows(1), post_images: images });
  const statements: string[] = [];
  const snapshot = await snapshotOver(db, statements);
  const estimate = await snapshot.estimate(new AbortController().signal);
  const inventory = await snapshot.export(identity, new AbortController().signal);
  expect(statements.find((sql) => sql.startsWith('DECLARE iori_images'))).toContain(
    `WHERE ${EXPORT_ROW_SCOPE.post_images}`,
  );
  expect(estimate).toMatchObject({ upload_count: 2, upload_bytes: 5, upload_missing_count: 1 });
  expect(inventory.missingUploadCount).toBe(estimate.upload_missing_count);
  expect(inventory.files.filter((file) => file.id.startsWith('upload.')).map((file) => file.id)).toEqual([
    `upload.${presentId}.png`,
  ]);
});

it('keeps counting every row of every table in rows, whatever the export scope', async () => {
  const rows: Record<string, FixtureRow[]> = { ...scopeFixtureRows(1), post_images: images };
  const estimate = await (await snapshotOver(sqliteOf(rows))).estimate(new AbortController().signal);
  expect(estimate.rows).toBe(APPLICATION_TABLE_ORDER.reduce((sum, table) => sum + (rows[table]?.length ?? 0), 0));
});

it.each<[string, (rows: Record<string, FixtureRow[]>) => void]>([
  ['no owner', (rows) => {
    rows.local_actors = [];
  }],
  ['two owners', (rows) => {
    rows.users = [...rows.users!, { userId: uuid(200), username: 'other' }];
    rows.local_actors = [...rows.local_actors!, { actorId: ids.a, userId: uuid(200) }];
  }],
])('fails the estimate with estimate-export-owner for %s', async (_name, change) => {
  const rows = { ...scopeFixtureRows(1), post_images: images };
  change(rows);
  await expect((await snapshotOver(sqliteOf(rows))).estimate(new AbortController().signal)).rejects.toThrow(
    'source_estimate_failed:estimate-export-owner',
  );
});
