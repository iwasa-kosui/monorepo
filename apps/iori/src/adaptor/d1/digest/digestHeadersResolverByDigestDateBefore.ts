import { RA } from '@iwasa-kosui/result';
import { asc, lt } from 'drizzle-orm';

import type { DigestHeadersResolverByDigestDateBefore } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { digestsTable } from '../schema.ts';
import { reconstructDigestHeader } from './digestHeaderMapper.ts';

export const createD1DigestHeadersResolverByDigestDateBefore = (
  db: IoriD1Db,
): DigestHeadersResolverByDigestDateBefore => ({
  resolve: async ({ digestDateBefore, limit }) => {
    const rows = await db.select().from(digestsTable)
      .where(lt(digestsTable.digestDate, digestDateBefore))
      .orderBy(asc(digestsTable.digestDate), asc(digestsTable.digestId))
      .limit(limit);
    return RA.ok(rows.map(reconstructDigestHeader));
  },
});
