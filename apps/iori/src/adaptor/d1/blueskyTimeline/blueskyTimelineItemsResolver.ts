import { RA } from '@iwasa-kosui/result';
import { desc, lt } from 'drizzle-orm';

import type { BlueskyTimelineItemsResolver } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyTimelineItemsTable } from '../schema.ts';
import { toBlueskyTimelineItem } from './blueskyTimelineItemRow.ts';

export const createD1BlueskyTimelineItemsResolver = (db: IoriD1Db): BlueskyTimelineItemsResolver => ({
  resolve: async ({ limit, before }) => {
    const rows = await db.select().from(blueskyTimelineItemsTable)
      .where(before === undefined ? undefined : lt(blueskyTimelineItemsTable.indexedAt, new Date(before)))
      .orderBy(desc(blueskyTimelineItemsTable.indexedAt), desc(blueskyTimelineItemsTable.feedItemId))
      .limit(limit);
    return RA.ok(rows.map(toBlueskyTimelineItem));
  },
});
