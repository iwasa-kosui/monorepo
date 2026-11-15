import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { BlueskyLikeTargetResolver } from '../../../domain/blueskyTimeline/blueskyLike.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyLikesTable, blueskyTimelineItemsTable } from '../schema.ts';

export const createD1BlueskyLikeTargetResolver = (db: IoriD1Db, userId: UserId): BlueskyLikeTargetResolver => ({
  resolve: async (feedItemId) => {
    const [row] = await db.select({
      uri: blueskyTimelineItemsTable.uri,
      cid: blueskyTimelineItemsTable.cid,
      likeUri: blueskyLikesTable.likeUri,
    })
      .from(blueskyTimelineItemsTable)
      .leftJoin(
        blueskyLikesTable,
        and(eq(blueskyLikesTable.userId, userId), eq(blueskyLikesTable.subjectUri, blueskyTimelineItemsTable.uri)),
      )
      .where(and(eq(blueskyTimelineItemsTable.userId, userId), eq(blueskyTimelineItemsTable.feedItemId, feedItemId)))
      .limit(1);
    return RA.ok(row);
  },
});
