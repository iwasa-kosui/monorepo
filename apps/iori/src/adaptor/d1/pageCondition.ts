import { asc, desc, type SQL, sql } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import type { PageRequest } from '../../domain/page/page.ts';

type PageColumns = Readonly<{ createdAt: SQLiteColumn; id: SQLiteColumn }>;

export type PageCursorQuery = (id: string) => SQL;

export const pageConditions = (
  page: PageRequest,
  columns: PageColumns,
  cursorOf: PageCursorQuery,
): ReadonlyArray<SQL> => [
  ...(page.olderThanId === undefined
    ? []
    : [sql`(${columns.createdAt}, ${columns.id}) < (${cursorOf(page.olderThanId)})`]),
  ...(page.newerThanId === undefined
    ? []
    : [sql`(${columns.createdAt}, ${columns.id}) > (${cursorOf(page.newerThanId)})`]),
];

export const pageOrderBy = (page: PageRequest, columns: PageColumns): ReadonlyArray<SQL> =>
  page.order === 'newestFirst'
    ? [desc(columns.createdAt), desc(columns.id)]
    : [asc(columns.createdAt), asc(columns.id)];
