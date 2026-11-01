import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { expect, it } from 'vitest';

import { APPLICATION_TABLE_ORDER, exportPostgres } from '../export-postgres.mjs';
import {
  exportedRowCounts,
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
it.skipIf(process.env.IORI_RUN_POSTGRES_FIXTURE !== '1')(
  'exports an actual PostgreSQL16 repeatable-read snapshot across later-table mutation',
  async () => {
    const docker = process.platform === 'darwin' ? join(homedir(), '.rd/bin/docker') : 'docker';
    const name = `iori-source-fixture-${randomUUID()}`;
    const root = await createFixtureDirectory('iori-real-pg-');
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
      const fixture = connection;
      for (const statement of await productionSchemaStatements()) await fixture.query(statement);
      const fixtureRows = scopeFixtureRows('2026-01-01T00:00:00Z');
      for (const table of APPLICATION_TABLE_ORDER) {
        for (const row of fixtureRows[table] ?? []) {
          const { sql, values } = insertStatement(table, row, index => `$${index}`);
          await fixture.query(sql, values);
        }
      }
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
        for (const unrelated of [...outOfScopeActors, ...outOfScopePosts]) expect(text, table).not.toContain(unrelated);
      }
    } finally {
      await connection?.end();
      if (created) await exec(docker, ['rm', '-f', name]);
      await rm(root, { recursive: true, force: true });
    }
  },
  90_000,
);
