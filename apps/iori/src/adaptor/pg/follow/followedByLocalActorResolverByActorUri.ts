import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FollowedByLocalActorResolverByActorUri } from '../../../domain/follow/follow.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { actorsTable, followsTable, localActorsTable } from '../schema.ts';

const getInstance = singleton((): FollowedByLocalActorResolverByActorUri => ({
  resolve: async ({ actorUri }) => {
    const rows = await DB.getInstance().select({ followerId: followsTable.followerId }).from(followsTable)
      .innerJoin(actorsTable, eq(actorsTable.actorId, followsTable.followingId))
      .innerJoin(localActorsTable, eq(localActorsTable.actorId, followsTable.followerId))
      .where(eq(actorsTable.uri, actorUri))
      .limit(1)
      .execute();
    return RA.ok(rows.length > 0);
  },
}));

export const PgFollowedByLocalActorResolverByActorUri = {
  getInstance,
} as const;
