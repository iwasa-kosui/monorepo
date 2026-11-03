import type { BatchItem } from 'drizzle-orm/batch';

import type { IoriD1Db } from './client.ts';

export const runBatch = async (db: IoriD1Db, statements: ReadonlyArray<BatchItem<'sqlite'>>): Promise<void> => {
  const [first, ...rest] = statements;
  if (first === undefined) return;
  await db.batch([first, ...rest]);
};
