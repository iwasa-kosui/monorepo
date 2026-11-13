import { getTableColumns, type SQL, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { IoriD1Db } from './client.ts';

export const guardedInsert = <TTable extends SQLiteTable>(
  db: IoriD1Db,
  table: TTable,
  row: TTable['$inferInsert'],
  guard: SQL,
) => {
  const params = Object.entries(getTableColumns(table)).map(([key, column]) =>
    sql.param((row as Record<string, unknown>)[key] ?? null, column)
  );
  return db.insert(table).select(sql`select ${sql.join(params, sql`, `)} where ${guard}`);
};
