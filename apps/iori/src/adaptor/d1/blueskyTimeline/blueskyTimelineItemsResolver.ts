import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, isNotNull, lt, notExists, or, type SQL, sql } from 'drizzle-orm';

import type { BlueskyTimelineItemsResolver } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyCrosspostsTable, blueskyTimelineItemsTable } from '../schema.ts';
import { toBlueskyTimelineItem } from './blueskyTimelineItemRow.ts';

export const createD1BlueskyTimelineItemsResolver = (db: IoriD1Db): BlueskyTimelineItemsResolver => ({
  resolve: async ({ limit, before, beforeId, excludeCrossposted }) => {
    const beforeAt = before === undefined ? undefined : new Date(before);
    const conditions: SQL[] = [];
    if (beforeAt !== undefined) {
      conditions.push(
        beforeId === undefined
          ? lt(blueskyTimelineItemsTable.indexedAt, beforeAt)
          : or(
            lt(blueskyTimelineItemsTable.indexedAt, beforeAt),
            and(
              eq(blueskyTimelineItemsTable.indexedAt, beforeAt),
              lt(blueskyTimelineItemsTable.feedItemId, beforeId),
            ),
          )!,
      );
    }
    if (excludeCrossposted === true) {
      conditions.push(
        or(
          isNotNull(blueskyTimelineItemsTable.repostedByDid),
          notExists(
            db.select({ one: sql`1` }).from(blueskyCrosspostsTable)
              .where(eq(blueskyCrosspostsTable.uri, blueskyTimelineItemsTable.uri)),
          ),
        )!,
      );
    }
    const rows = await db.select().from(blueskyTimelineItemsTable)
      .where(conditions.length === 0 ? undefined : and(...conditions))
      .orderBy(desc(blueskyTimelineItemsTable.indexedAt), desc(blueskyTimelineItemsTable.feedItemId))
      .limit(limit);
    return RA.ok(rows.map(toBlueskyTimelineItem));
  },
});
