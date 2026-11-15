import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { BlueskyTimelineExistingFeedItemIdsResolver } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { blueskyTimelineItemsTable } from '../schema.ts';

export const createD1BlueskyTimelineExistingFeedItemIdsResolver = (
  db: IoriD1Db,
  userId: UserId,
): BlueskyTimelineExistingFeedItemIdsResolver => ({
  resolve: async (feedItemIds) => {
    if (feedItemIds.length === 0) return RA.ok([]);
    const rows = await db.select({ feedItemId: blueskyTimelineItemsTable.feedItemId }).from(blueskyTimelineItemsTable)
      .where(and(
        eq(blueskyTimelineItemsTable.userId, userId),
        inArray(blueskyTimelineItemsTable.feedItemId, sql`(select value from json_each(${idsJson(feedItemIds)}))`),
      ));
    return RA.ok(rows.map((row) => row.feedItemId));
  },
});
