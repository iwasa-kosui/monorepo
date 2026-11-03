import { asc, eq } from 'drizzle-orm';

import { Digest, type DigestHeader } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { digestItemsTable, digestTrendsTable } from '../schema.ts';

export const reconstructDigest = async (db: IoriD1Db, header: DigestHeader): Promise<Digest> => {
  const [items, trends] = await Promise.all([
    db.select().from(digestItemsTable)
      .where(eq(digestItemsTable.digestId, header.digestId))
      .orderBy(asc(digestItemsTable.rank)),
    db.select().from(digestTrendsTable)
      .where(eq(digestTrendsTable.digestId, header.digestId))
      .orderBy(asc(digestTrendsTable.kind), asc(digestTrendsTable.rank)),
  ]);
  return Digest.parseOrThrow({
    ...header,
    items,
    trends: trends.map(({ digestId: _digestId, ...trend }) => trend),
  });
};
