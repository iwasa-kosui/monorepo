import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import { Follow, type FollowAggregateId } from '../../../domain/follow/follow.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { followsTable } from '../schema.ts';

const getInstance = singleton(() => ({
  resolve: async (agg: FollowAggregateId) => {
    const [row, ...rest] = await DB.getInstance().select().from(followsTable).where(
      and(
        eq(followsTable.followerId, agg.followerId),
        eq(followsTable.followingId, agg.followingId),
      ),
    ).execute();
    if (!row) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error('Inconsistent state: multiple follow records found');
    }
    return RA.ok(Follow.orThrow({ followerId: row.followerId, followingId: row.followingId }));
  },
}));

export const PgFollowResolver = {
  getInstance,
} as const;
