import type { D1Database } from '@cloudflare/workers-types';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { createD1Db } from '../client.ts';

/** Real SQLite execution and Drizzle mapping; enforce D1's lower binding limit. */
export const createSqliteD1Fixture = () => {
  const sqlite = new DatabaseSync(':memory:');
  const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
  }
  sqlite.exec('PRAGMA foreign_keys=ON');
  const queries: Array<{ sql: string; params: SQLInputValue[] }> = [];
  const bound = (sql: string, params: SQLInputValue[]) => ({
    sql,
    params,
    raw: async () => {
      const statement = sqlite.prepare(sql);
      statement.setReturnArrays(true);
      return statement.all(...params);
    },
    all: async () => ({ results: sqlite.prepare(sql).all(...params), success: true, meta: {} }),
    run: async () => {
      const { changes } = sqlite.prepare(sql).run(...params);
      return { results: [], success: true, meta: { changes: Number(changes) } };
    },
  });
  const binding = {
    prepare: (sql: string) => ({
      bind: (...params: SQLInputValue[]) => {
        if (params.length > 100) throw new Error(`D1 parameter limit exceeded: ${params.length}`);
        queries.push({ sql, params });
        return bound(sql, params);
      },
    }),
    batch: async (statements: Array<ReturnType<typeof bound>>) => {
      sqlite.exec('BEGIN');
      try {
        const results = await Promise.all(statements.map((statement) => statement.all()));
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  // Test-only read binding; production uses Cloudflare's complete D1Database.
  const db = createD1Db(binding as unknown as D1Database);
  return { sqlite, db, queries, binding: binding as unknown as D1Database };
};
