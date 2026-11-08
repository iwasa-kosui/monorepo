import { RA } from '@iwasa-kosui/result';
import { inArray, sql } from 'drizzle-orm';

import type { BlueskyTimelineExistingFeedItemIdsResolver } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { blueskyTimelineItemsTable } from '../schema.ts';

export const createD1BlueskyTimelineExistingFeedItemIdsResolver = (
  db: IoriD1Db,
): BlueskyTimelineExistingFeedItemIdsResolver => ({
  resolve: async (feedItemIds) => {
    if (feedItemIds.length === 0) return RA.ok([]);
    const rows = await db.select({ feedItemId: blueskyTimelineItemsTable.feedItemId }).from(blueskyTimelineItemsTable)
      .where(
        inArray(blueskyTimelineItemsTable.feedItemId, sql`(select value from json_each(${idsJson(feedItemIds)}))`),
      );
    return RA.ok(rows.map((row) => row.feedItemId));
  },
});
