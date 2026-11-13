import type { D1Result } from '@cloudflare/workers-types';
import type { BatchItem } from 'drizzle-orm/batch';

import type { IoriD1Db } from './client.ts';

export const runBatch = async (db: IoriD1Db, statements: ReadonlyArray<BatchItem<'sqlite'>>): Promise<void> => {
  const [first, ...rest] = statements;
  if (first === undefined) return;
  await db.batch([first, ...rest]);
};

export const runBatchChanges = async (
  db: IoriD1Db,
  statements: ReadonlyArray<BatchItem<'sqlite'>>,
): Promise<ReadonlyArray<number>> => {
  const [first, ...rest] = statements;
  if (first === undefined) return [];
  const results: ReadonlyArray<unknown> = await db.batch([first, ...rest]);
  return results.map((result) => (result as D1Result).meta.changes);
};
