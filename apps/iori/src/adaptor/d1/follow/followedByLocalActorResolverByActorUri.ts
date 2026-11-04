import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FollowedByLocalActorResolverByActorUri } from '../../../domain/follow/follow.ts';
import type { IoriD1Db } from '../client.ts';
import { actorsTable, followsTable, localActorsTable } from '../schema.ts';

export const createD1FollowedByLocalActorResolverByActorUri = (
  db: IoriD1Db,
): FollowedByLocalActorResolverByActorUri => ({
  resolve: async ({ actorUri }) => {
    const rows = await db.select({ followerId: followsTable.followerId }).from(followsTable)
      .innerJoin(actorsTable, eq(actorsTable.actorId, followsTable.followingId))
      .innerJoin(localActorsTable, eq(localActorsTable.actorId, followsTable.followerId))
      .where(eq(actorsTable.uri, actorUri))
      .limit(1);
    return RA.ok(rows.length > 0);
  },
});
