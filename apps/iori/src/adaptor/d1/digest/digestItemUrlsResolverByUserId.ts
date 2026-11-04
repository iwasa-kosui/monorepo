import { RA } from '@iwasa-kosui/result';
import { and, eq, notInArray } from 'drizzle-orm';

import type { DigestItemUrlsResolverByUserId } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { digestItemsTable, digestsTable } from '../schema.ts';

export const createD1DigestItemUrlsResolverByUserId = (db: IoriD1Db): DigestItemUrlsResolverByUserId => ({
  resolve: async ({ userId, excludingDigestIds }) => {
    const rows = await db.select({ url: digestItemsTable.url }).from(digestItemsTable)
      .innerJoin(digestsTable, eq(digestsTable.digestId, digestItemsTable.digestId))
      .where(and(
        eq(digestsTable.userId, userId),
        excludingDigestIds.length === 0 ? undefined : notInArray(digestsTable.digestId, [...excludingDigestIds]),
      ));
    return RA.ok(rows.map((row) => row.url));
  },
});
