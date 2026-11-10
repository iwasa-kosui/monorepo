import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { BlueskyLikeTargetResolver } from '../../../domain/blueskyTimeline/blueskyLike.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyLikesTable, blueskyTimelineItemsTable } from '../schema.ts';

export const createD1BlueskyLikeTargetResolver = (db: IoriD1Db): BlueskyLikeTargetResolver => ({
  resolve: async (feedItemId) => {
    const [row] = await db.select({
      uri: blueskyTimelineItemsTable.uri,
      cid: blueskyTimelineItemsTable.cid,
      likeUri: blueskyLikesTable.likeUri,
    })
      .from(blueskyTimelineItemsTable)
      .leftJoin(blueskyLikesTable, eq(blueskyLikesTable.subjectUri, blueskyTimelineItemsTable.uri))
      .where(eq(blueskyTimelineItemsTable.feedItemId, feedItemId))
      .limit(1);
    return RA.ok(row);
  },
});
