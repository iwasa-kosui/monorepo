import { RA } from '@iwasa-kosui/result';
import { and, asc, eq } from 'drizzle-orm';

import type { DigestHeadersResolverByUserIdAndDigestDate } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { digestsTable } from '../schema.ts';
import { reconstructDigestHeader } from './digestHeaderMapper.ts';

export const createD1DigestHeadersResolverByUserIdAndDigestDate = (
  db: IoriD1Db,
): DigestHeadersResolverByUserIdAndDigestDate => ({
  resolve: async ({ userId, digestDate }) => {
    const rows = await db.select().from(digestsTable)
      .where(and(eq(digestsTable.userId, userId), eq(digestsTable.digestDate, digestDate)))
      .orderBy(asc(digestsTable.createdAt), asc(digestsTable.digestId));
    return RA.ok(rows.map(reconstructDigestHeader));
  },
});
