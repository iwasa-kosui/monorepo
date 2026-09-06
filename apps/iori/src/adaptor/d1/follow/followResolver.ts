import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import { Follow, type FollowResolver } from '../../../domain/follow/follow.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { followsTable } from '../schema.ts';

export const createD1FollowResolver = (db: IoriD1Db): FollowResolver => ({
  resolve: (aggregateId) =>
    RA.flow(
      fromD1(async () => {
        const [row, ...rest] = await db.select().from(followsTable).where(
          and(
            eq(followsTable.followerId, aggregateId.followerId),
            eq(followsTable.followingId, aggregateId.followingId),
          ),
        );
        if (row === undefined) return undefined;
        if (rest.length > 0) throw new Error('Inconsistent state: multiple follow records found');
        return Follow.orThrow({ followerId: row.followerId, followingId: row.followingId });
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
