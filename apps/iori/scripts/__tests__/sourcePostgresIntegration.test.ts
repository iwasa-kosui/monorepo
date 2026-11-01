import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Client, type ClientConfig } from 'pg';
import { afterEach, expect, it } from 'vitest';

import { SourceSnapshot } from '../../src/adaptor/node/source/sourceSnapshot.ts';
import { APPLICATION_TABLE_ORDER, exportPostgres } from '../export-postgres.mjs';
import {
  exportedRowCounts,
  type FixtureRow,
  ids,
  insertStatement,
  outOfScopeActors,
  outOfScopePosts,
  scopeFixtureRows,
} from './exportRowScopeFixture.ts';
import { createFixtureDirectory } from './fixtureTemp.ts';

const exec = promisify(execFile);
const drizzleDirectory = new URL('../../drizzle/', import.meta.url);
const productionSchemaStatements = async () => {
  const journal = JSON.parse(await readFile(new URL('meta/_journal.json', drizzleDirectory), 'utf8')) as {
    entries: { tag: string }[];
  };
  const statements: string[] = [];
  for (const { tag } of journal.entries) {
    const body = await readFile(new URL(`${tag}.sql`, drizzleDirectory), 'utf8');
    statements.push(...body.split('--> statement-breakpoint').map(statement => statement.trim()).filter(Boolean));
  }
  return statements;
};
const withFixtureServer = async (run: (options: ClientConfig, fixture: Client) => Promise<void>) => {
  const docker = process.platform === 'darwin' ? join(homedir(), '.rd/bin/docker') : 'docker';
  const name = `iori-source-fixture-${randomUUID()}`;
  let created = false;
  let connection: Client | undefined;
  try {
    await exec(docker, [
      'create',
      '--pull=never',
      '--name',
      name,
      '-p',
      '127.0.0.1::5432',
      '-e',
      'POSTGRES_USER=fixture',
      '-e',
      'POSTGRES_PASSWORD=synthetic-fixture-only',
      '-e',
      'POSTGRES_DB=fixture',
      'postgres:16',
    ]);
    created = true;
    await exec(docker, ['start', name]);
    const { stdout } = await exec(docker, ['port', name, '5432/tcp']);
    const match = /^127\.0\.0\.1:(\d+)\s*$/.exec(stdout);
    if (!match) throw new Error('invalid fixture port');
    const options = {
      host: '127.0.0.1',
      port: Number(match[1]),
      user: 'fixture',
      password: 'synthetic-fixture-only',
      database: 'fixture',
      connectionTimeoutMillis: 1000,
    };
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = new Client(options);
      try {
        await candidate.connect();
        connection = candidate;
        break;
      } catch {
        await candidate.end();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (!connection) throw new Error('fixture not ready');
    await run(options, connection);
  } finally {
    await connection?.end();
    if (created) await exec(docker, ['rm', '-f', name]);
  }
};
const seedFixture = async (fixture: Client, rows: Record<string, FixtureRow[]>) => {
  for (const statement of await productionSchemaStatements()) await fixture.query(statement);
  for (const table of APPLICATION_TABLE_ORDER) {
    for (const row of rows[table] ?? []) {
      const { sql, values } = insertStatement(table, row, index => `$${index}`);
      await fixture.query(sql, values);
    }
  }
};
it.skipIf(process.env.IORI_RUN_POSTGRES_FIXTURE !== '1')(
  'exports an actual PostgreSQL16 repeatable-read snapshot across later-table mutation',
  () =>
    withFixtureServer(async (options, fixture) => {
      const root = await createFixtureDirectory('iori-real-pg-');
      try {
        const fixtureRows = scopeFixtureRows('2026-01-01T00:00:00Z');
        await seedFixture(fixture, fixtureRows);
        let changed = false;
        const client = new Client(options);
        await exportPostgres({
          outputDir: join(root, 'export'),
          pageSize: 1,
          createClient: async () => ({
            connect: () => client.connect(),
            end: () => client.end(),
            query: async (sql) => {
              const result = await client.query(sql);
              if (sql.startsWith('FETCH') && !changed) {
                await fixture.query('UPDATE actors SET "uri" = "uri" || $1', ['-after']);
                changed = true;
              }
              return result;
            },
          }),
        });
        expect(changed).toBe(true);
        const after = await fixture.query('SELECT "uri" FROM actors');
        expect(after.rows.length).toBeGreaterThan(0);
        expect(after.rows.every((row: { uri: string }) => row.uri.endsWith('-after'))).toBe(true);
        const lines = async (table: string) =>
          (await readFile(join(root, `export/${table}.ndjson`), 'utf8')).split('\n').filter(Boolean);
        const exportedActors = (await lines('actors')).map(line => JSON.parse(line) as { uri: string });
        expect(exportedActors.length).toBeGreaterThan(0);
        expect(exportedActors.every(actor => !actor.uri.endsWith('-after'))).toBe(true);
        const manifest = JSON.parse(await readFile(join(root, 'export/export-manifest.json'), 'utf8'));
        expect(manifest.complete).toBe(true);
        for (const table of APPLICATION_TABLE_ORDER) {
          expect(manifest.tables[table].count, table).toBe(exportedRowCounts[table] ?? fixtureRows[table]!.length);
          const text = (await lines(table)).join('\n');
          for (const unrelated of [...outOfScopeActors, ...outOfScopePosts]) {
            expect(text, table).not.toContain(unrelated);
          }
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }),
  90_000,
);

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
const uuid = (n: number) => `99999999-9999-4999-8999-${n.toString(16).padStart(12, '0')}`;
const [presentId, missingId, strayMissingId, strayLegacyId] = [uuid(1), uuid(2), uuid(3), uuid(4)];
const imageRow = (n: number, postId: string, url: string): FixtureRow => ({
  imageId: uuid(100 + n),
  postId,
  url,
  createdAt: '2026-01-01T00:00:00Z',
});
const images = [
  imageRow(1, ids.myPost, `/uploads/${presentId}.png`),
  imageRow(2, ids.myPost, `/uploads/${missingId}.png`),
  imageRow(3, ids.dPost, 'https://d.example.test/media/1.png'),
  imageRow(4, ids.fPost, `/uploads/${strayMissingId}.png`),
  imageRow(5, ids.fPost, `/static/uploads/${strayLegacyId}.png`),
  imageRow(6, ids.fPost, 'data:image/png;base64,AAAA'),
];
const snapshotOver = async (options: ClientConfig) => {
  const base = await createFixtureDirectory('iori-source-pg-scope-');
  roots.push(base);
  const uploadDir = join(base, 'originals');
  await mkdir(uploadDir);
  await writeFile(join(uploadDir, `${presentId}.png`), 'image');
  await mkdir(join(base, 'exports'), { mode: 0o700 });
  return new SourceSnapshot({
    base,
    uploadDir,
    origin: 'https://blog.test',
    createClient: async () => new Client(options),
  });
};
it.skipIf(process.env.IORI_RUN_POSTGRES_FIXTURE !== '1')(
  'estimates on an actual PostgreSQL16 with the export scope and agrees with the export on the missing uploads',
  () =>
    withFixtureServer(async (options, fixture) => {
      await seedFixture(fixture, { ...scopeFixtureRows('2026-01-01T00:00:00Z'), post_images: images });
      const snapshot = await snapshotOver(options);
      const estimate = await snapshot.estimate(new AbortController().signal);
      expect(estimate).toMatchObject({ upload_count: 2, upload_bytes: 5, upload_missing_count: 1 });
      const inventory = await snapshot.export(
        { main_sha: 'a'.repeat(40), run_id: 'fixture' },
        new AbortController().signal,
      );
      expect(inventory.missingUploadCount).toBe(estimate.upload_missing_count);
      expect(inventory.files.filter((file) => file.id.startsWith('upload.')).map((file) => file.id)).toEqual([
        `upload.${presentId}.png`,
      ]);

      await fixture.query('CREATE DATABASE fixture_without_owner');
      const withoutOwner = new Client({ ...options, database: 'fixture_without_owner' });
      await withoutOwner.connect();
      try {
        await seedFixture(withoutOwner, {
          ...scopeFixtureRows('2026-01-01T00:00:00Z'),
          local_actors: [],
          post_images: images,
        });
      } finally {
        await withoutOwner.end();
      }
      await expect(
        (await snapshotOver({ ...options, database: 'fixture_without_owner' })).estimate(new AbortController().signal),
      ).rejects.toThrow('source_estimate_failed:estimate-export-owner');
    }),
  90_000,
);
