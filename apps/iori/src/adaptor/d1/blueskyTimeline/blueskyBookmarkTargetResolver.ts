import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { BlueskyBookmarkTargetResolver } from '../../../domain/blueskyTimeline/blueskyBookmark.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyTimelineItemsTable } from '../schema.ts';

export const createD1BlueskyBookmarkTargetResolver = (db: IoriD1Db): BlueskyBookmarkTargetResolver => ({
  resolve: async (feedItemId) => {
    const [row] = await db.select({ uri: blueskyTimelineItemsTable.uri, cid: blueskyTimelineItemsTable.cid })
      .from(blueskyTimelineItemsTable)
      .where(eq(blueskyTimelineItemsTable.feedItemId, feedItemId))
      .limit(1);
    return RA.ok(row);
  },
});
