import { RA } from '@iwasa-kosui/result';

import type { BlueskyTimelineItemsSavedStore } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyTimelineItemsTable } from '../schema.ts';
import { toBlueskyTimelineItemRow } from './blueskyTimelineItemRow.ts';

// D1 のバインド数の上限（100）に収まるよう、1 行 20 列で 4 行ずつ入れる
const INSERT_CHUNK_SIZE = 4;

export const createD1BlueskyTimelineItemsSavedStore = (db: IoriD1Db, userId: UserId): BlueskyTimelineItemsSavedStore => ({
  save: async (items) => {
    const inserted: string[] = [];
    for (let start = 0; start < items.length; start += INSERT_CHUNK_SIZE) {
      const rows = await db.insert(blueskyTimelineItemsTable)
        .values(items.slice(start, start + INSERT_CHUNK_SIZE).map((item) => ({ userId, ...toBlueskyTimelineItemRow(item) })))
        .onConflictDoNothing()
        .returning({ feedItemId: blueskyTimelineItemsTable.feedItemId });
      inserted.push(...rows.map((row) => row.feedItemId));
    }
    return RA.ok(inserted);
  },
});
