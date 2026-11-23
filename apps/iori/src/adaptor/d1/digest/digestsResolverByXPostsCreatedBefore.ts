import { RA } from '@iwasa-kosui/result';
import { and, asc, isNotNull, lt } from 'drizzle-orm';

import type { DigestsResolverByXPostsCreatedBefore } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { digestsTable } from '../schema.ts';
import { reconstructDigestHeader } from './digestHeaderMapper.ts';
import { reconstructDigest } from './digestMapper.ts';

export const createD1DigestsResolverByXPostsCreatedBefore = (
  db: IoriD1Db,
): DigestsResolverByXPostsCreatedBefore => ({
  resolve: async ({ createdBefore }) => {
    const rows = await db.select().from(digestsTable)
      .where(and(isNotNull(digestsTable.xPostsPostId), lt(digestsTable.createdAt, new Date(createdBefore))))
      .orderBy(asc(digestsTable.createdAt), asc(digestsTable.digestId));
    return RA.ok(await Promise.all(rows.map((row) => reconstructDigest(db, reconstructDigestHeader(row)))));
  },
});
