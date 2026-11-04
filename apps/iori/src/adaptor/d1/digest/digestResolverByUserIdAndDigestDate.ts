import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import { type DigestResolverByUserIdAndDigestDate, SUMMARY_DIGEST_TOPIC_KEY } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { digestsTable } from '../schema.ts';
import { reconstructDigestHeader } from './digestHeaderMapper.ts';
import { reconstructDigest } from './digestMapper.ts';

export const createD1DigestResolverByUserIdAndDigestDate = (
  db: IoriD1Db,
): DigestResolverByUserIdAndDigestDate => ({
  resolve: async ({ userId, digestDate }) => {
    const [row] = await db.select().from(digestsTable)
      .where(and(
        eq(digestsTable.userId, userId),
        eq(digestsTable.digestDate, digestDate),
        eq(digestsTable.topicKey, SUMMARY_DIGEST_TOPIC_KEY),
      ))
      .limit(1);
    return RA.ok(row === undefined ? undefined : await reconstructDigest(db, reconstructDigestHeader(row)));
  },
});
