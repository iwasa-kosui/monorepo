import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, lt, or } from 'drizzle-orm';

import type { BlueskyTimelineItemsResolver } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyTimelineItemsTable } from '../schema.ts';
import { toBlueskyTimelineItem } from './blueskyTimelineItemRow.ts';

export const createD1BlueskyTimelineItemsResolver = (db: IoriD1Db): BlueskyTimelineItemsResolver => ({
  resolve: async ({ limit, before, beforeId }) => {
    const beforeAt = before === undefined ? undefined : new Date(before);
    const rows = await db.select().from(blueskyTimelineItemsTable)
      .where(
        beforeAt === undefined
          ? undefined
          : beforeId === undefined
          ? lt(blueskyTimelineItemsTable.indexedAt, beforeAt)
          : or(
            lt(blueskyTimelineItemsTable.indexedAt, beforeAt),
            and(
              eq(blueskyTimelineItemsTable.indexedAt, beforeAt),
              lt(blueskyTimelineItemsTable.feedItemId, beforeId),
            ),
          ),
      )
      .orderBy(desc(blueskyTimelineItemsTable.indexedAt), desc(blueskyTimelineItemsTable.feedItemId))
      .limit(limit);
    return RA.ok(rows.map(toBlueskyTimelineItem));
  },
});
