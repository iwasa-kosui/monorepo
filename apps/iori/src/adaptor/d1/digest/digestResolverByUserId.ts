import { RA } from '@iwasa-kosui/result';
import { desc, eq } from 'drizzle-orm';

import type { DigestResolverByUserId } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { digestsTable } from '../schema.ts';
import { reconstructDigestHeader } from './digestHeaderMapper.ts';
import { reconstructDigest } from './digestMapper.ts';

export const createD1DigestResolverByUserId = (db: IoriD1Db): DigestResolverByUserId => ({
  resolve: async (userId) => {
    const [row] = await db.select().from(digestsTable)
      .where(eq(digestsTable.userId, userId))
      .orderBy(desc(digestsTable.digestDate))
      .limit(1);
    return RA.ok(row === undefined ? undefined : await reconstructDigest(db, reconstructDigestHeader(row)));
  },
});
