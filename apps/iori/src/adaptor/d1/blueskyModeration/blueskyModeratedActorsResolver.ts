import { RA } from '@iwasa-kosui/result';
import { eq, isNotNull, or } from 'drizzle-orm';

import type { BlueskyModeratedActorsResolver } from '../../../domain/blueskyModeration/blueskyModeration.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyModeratedActorsTable } from '../schema.ts';

export const createD1BlueskyModeratedActorsResolver = (db: IoriD1Db): BlueskyModeratedActorsResolver => ({
  resolveExcludedDids: async () => {
    const rows = await db.select({ did: blueskyModeratedActorsTable.did })
      .from(blueskyModeratedActorsTable)
      .where(or(eq(blueskyModeratedActorsTable.muted, 1), isNotNull(blueskyModeratedActorsTable.blockUri)));
    return RA.ok(new Set(rows.map((row) => row.did)));
  },
  resolveState: async (did) => {
    const [row] = await db.select({
      muted: blueskyModeratedActorsTable.muted,
      blockUri: blueskyModeratedActorsTable.blockUri,
    })
      .from(blueskyModeratedActorsTable)
      .where(eq(blueskyModeratedActorsTable.did, did));
    return RA.ok({ muted: row?.muted === 1, blockUri: row?.blockUri ?? null });
  },
});
