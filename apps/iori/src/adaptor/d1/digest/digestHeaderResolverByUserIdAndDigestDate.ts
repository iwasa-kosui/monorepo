import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { DigestHeaderResolverByUserIdAndDigestDate } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { digestsTable } from '../schema.ts';
import { reconstructDigestHeader } from './digestHeaderMapper.ts';

export const createD1DigestHeaderResolverByUserIdAndDigestDate = (
  db: IoriD1Db,
): DigestHeaderResolverByUserIdAndDigestDate => ({
  resolve: async ({ userId, digestDate }) => {
    const [row] = await db.select().from(digestsTable)
      .where(and(eq(digestsTable.userId, userId), eq(digestsTable.digestDate, digestDate)))
      .limit(1);
    return RA.ok(row === undefined ? undefined : reconstructDigestHeader(row));
  },
});
