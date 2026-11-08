import { RA } from '@iwasa-kosui/result';

import type { BlueskyTimelineItemsSavedStore } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyTimelineItemsTable } from '../schema.ts';
import { toBlueskyTimelineItemRow } from './blueskyTimelineItemRow.ts';

const INSERT_CHUNK_SIZE = 5;

export const createD1BlueskyTimelineItemsSavedStore = (db: IoriD1Db): BlueskyTimelineItemsSavedStore => ({
  save: async (items) => {
    const inserted: string[] = [];
    for (let start = 0; start < items.length; start += INSERT_CHUNK_SIZE) {
      const rows = await db.insert(blueskyTimelineItemsTable)
        .values(items.slice(start, start + INSERT_CHUNK_SIZE).map(toBlueskyTimelineItemRow))
        .onConflictDoNothing()
        .returning({ feedItemId: blueskyTimelineItemsTable.feedItemId });
      inserted.push(...rows.map((row) => row.feedItemId));
    }
    return RA.ok(inserted);
  },
});
