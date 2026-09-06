import type { D1Database } from '@cloudflare/workers-types';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { createD1Db } from '../client.ts';

/** Real SQLite execution and Drizzle mapping; enforce D1's lower binding limit. */
export const createSqliteD1Fixture = () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../../../../drizzle-d1/0000_boring_xavin.sql', import.meta.url), 'utf8'));
  sqlite.exec('PRAGMA foreign_keys=ON');
  const queries: Array<{ sql: string; params: SQLInputValue[] }> = [];
  const binding = {
    prepare: (sql: string) => ({
      bind: (...params: SQLInputValue[]) => {
        if (params.length > 100) throw new Error(`D1 parameter limit exceeded: ${params.length}`);
        queries.push({ sql, params });
        return {
          raw: async () => {
            const statement = sqlite.prepare(sql);
            statement.setReturnArrays(true);
            return statement.all(...params);
          },
        };
      },
    }),
  };
  // Test-only read binding; production uses Cloudflare's complete D1Database.
  const db = createD1Db(binding as unknown as D1Database);
  return { sqlite, db, queries };
};
