import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { BlueskyModeratedActorsResolver } from '../../../domain/blueskyModeration/blueskyModeration.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyModeratedActorsTable } from '../schema.ts';

export const createD1BlueskyModeratedActorsResolver = (db: IoriD1Db, userId: UserId): BlueskyModeratedActorsResolver => ({
  resolveState: async (did) => {
    const [row] = await db.select({
      muted: blueskyModeratedActorsTable.muted,
      blockUri: blueskyModeratedActorsTable.blockUri,
    })
      .from(blueskyModeratedActorsTable)
      .where(and(eq(blueskyModeratedActorsTable.userId, userId), eq(blueskyModeratedActorsTable.did, did)));
    return RA.ok({ muted: row?.muted === 1, blockUri: row?.blockUri ?? null });
  },
  resolveUpdatedAt: async (did) => {
    const [row] = await db.select({ updatedAt: blueskyModeratedActorsTable.updatedAt })
      .from(blueskyModeratedActorsTable)
      .where(and(eq(blueskyModeratedActorsTable.userId, userId), eq(blueskyModeratedActorsTable.did, did)));
    return RA.ok(row === undefined ? undefined : Instant.orThrow(row.updatedAt.getTime()));
  },
});
