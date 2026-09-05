import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Client } from 'pg';
import { expect, it } from 'vitest';

import { APPLICATION_TABLE_ORDER, exportPostgres } from '../export-postgres.mjs';

const exec = promisify(execFile);
it.skipIf(process.env.IORI_RUN_POSTGRES_FIXTURE !== '1')(
  'exports an actual PostgreSQL16 repeatable-read snapshot across later-table mutation',
  async () => {
    const docker = '/Users/kosui/.rd/bin/docker';
    const name = `iori-source-fixture-${randomUUID()}`;
    const root = await mkdtemp('/private/tmp/iori-real-pg-');
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
      for (const table of APPLICATION_TABLE_ORDER) {
        await fixture.query(`CREATE TABLE "${table}" (id integer PRIMARY KEY, value text NOT NULL)`);
        await fixture.query(`INSERT INTO "${table}" VALUES (1, 'before')`);
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
              await fixture.query('UPDATE actors SET value = $1', ['after']);
              changed = true;
            }
            return result;
          },
        }),
      });
      expect(changed).toBe(true);
      expect((await fixture.query('SELECT value FROM actors')).rows[0].value).toBe('after');
      expect(JSON.parse(await readFile(join(root, 'export/actors.ndjson'), 'utf8'))).toEqual({
        id: 1,
        value: 'before',
      });
      expect(JSON.parse(await readFile(join(root, 'export/export-manifest.json'), 'utf8')).complete).toBe(true);
    } finally {
      await connection?.end();
      if (created) await exec(docker, ['rm', '-f', name]);
      await rm(root, { recursive: true, force: true });
    }
  },
  90_000,
);
