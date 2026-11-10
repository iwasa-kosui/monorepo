import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { DigestResolverByDigestItemId } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { digestItemsTable, digestsTable } from '../schema.ts';
import { reconstructDigestHeader } from './digestHeaderMapper.ts';
import { reconstructDigest } from './digestMapper.ts';

export const createD1DigestResolverByDigestItemId = (db: IoriD1Db): DigestResolverByDigestItemId => ({
  resolve: async (digestItemId) => {
    const [row] = await db.select({ digest: digestsTable }).from(digestItemsTable)
      .innerJoin(digestsTable, eq(digestItemsTable.digestId, digestsTable.digestId))
      .where(eq(digestItemsTable.digestItemId, digestItemId))
      .limit(1);
    return RA.ok(row === undefined ? undefined : await reconstructDigest(db, reconstructDigestHeader(row.digest)));
  },
});
