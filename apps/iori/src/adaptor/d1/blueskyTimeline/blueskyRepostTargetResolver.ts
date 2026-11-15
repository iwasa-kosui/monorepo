import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { BlueskyRepostTargetResolver } from '../../../domain/blueskyTimeline/blueskyRepost.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyRepostsTable, blueskyTimelineItemsTable } from '../schema.ts';

export const createD1BlueskyRepostTargetResolver = (db: IoriD1Db, userId: UserId): BlueskyRepostTargetResolver => ({
  resolve: async (feedItemId) => {
    const [row] = await db.select({
      uri: blueskyTimelineItemsTable.uri,
      cid: blueskyTimelineItemsTable.cid,
      repostUri: blueskyRepostsTable.repostUri,
    })
      .from(blueskyTimelineItemsTable)
      .leftJoin(
        blueskyRepostsTable,
        and(eq(blueskyRepostsTable.userId, userId), eq(blueskyRepostsTable.subjectUri, blueskyTimelineItemsTable.uri)),
      )
      .where(and(eq(blueskyTimelineItemsTable.userId, userId), eq(blueskyTimelineItemsTable.feedItemId, feedItemId)))
      .limit(1);
    return RA.ok(row);
  },
});
