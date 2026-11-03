import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, ne } from 'drizzle-orm';

import type { LatestDigestHeaderResolverByUserId } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { digestsTable } from '../schema.ts';
import { reconstructDigestHeader } from './digestHeaderMapper.ts';

export const createD1LatestDigestHeaderResolverByUserId = (db: IoriD1Db): LatestDigestHeaderResolverByUserId => ({
  resolve: async ({ userId, excludingDigestId }) => {
    const [row] = await db.select().from(digestsTable)
      .where(and(
        eq(digestsTable.userId, userId),
        excludingDigestId === undefined ? undefined : ne(digestsTable.digestId, excludingDigestId),
      ))
      .orderBy(desc(digestsTable.createdAt))
      .limit(1);
    return RA.ok(row === undefined ? undefined : reconstructDigestHeader(row));
  },
});
