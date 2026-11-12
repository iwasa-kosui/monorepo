import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { BlueskyModeratedActorsResolver } from '../../../domain/blueskyModeration/blueskyModeration.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyModeratedActorsTable } from '../schema.ts';

export const createD1BlueskyModeratedActorsResolver = (db: IoriD1Db): BlueskyModeratedActorsResolver => ({
  resolveState: async (did) => {
    const [row] = await db.select({
      muted: blueskyModeratedActorsTable.muted,
      blockUri: blueskyModeratedActorsTable.blockUri,
    })
      .from(blueskyModeratedActorsTable)
      .where(eq(blueskyModeratedActorsTable.did, did));
    return RA.ok({ muted: row?.muted === 1, blockUri: row?.blockUri ?? null });
  },
  resolveUpdatedAt: async (did) => {
    const [row] = await db.select({ updatedAt: blueskyModeratedActorsTable.updatedAt })
      .from(blueskyModeratedActorsTable)
      .where(eq(blueskyModeratedActorsTable.did, did));
    return RA.ok(row === undefined ? undefined : Instant.orThrow(row.updatedAt.getTime()));
  },
});
