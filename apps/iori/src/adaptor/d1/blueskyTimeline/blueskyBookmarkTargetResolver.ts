import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { BlueskyBookmarkTargetResolver } from '../../../domain/blueskyTimeline/blueskyBookmark.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyTimelineItemsTable } from '../schema.ts';

export const createD1BlueskyBookmarkTargetResolver = (db: IoriD1Db, userId: UserId): BlueskyBookmarkTargetResolver => ({
  resolve: async (feedItemId) => {
    const [row] = await db.select({ uri: blueskyTimelineItemsTable.uri, cid: blueskyTimelineItemsTable.cid })
      .from(blueskyTimelineItemsTable)
      .where(and(eq(blueskyTimelineItemsTable.userId, userId), eq(blueskyTimelineItemsTable.feedItemId, feedItemId)))
      .limit(1);
    return RA.ok(row);
  },
});
