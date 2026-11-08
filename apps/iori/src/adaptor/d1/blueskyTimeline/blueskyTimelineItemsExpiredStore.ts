import { RA } from '@iwasa-kosui/result';
import { lt } from 'drizzle-orm';

import type { BlueskyTimelineItemsExpiredStore } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyTimelineItemsTable } from '../schema.ts';

export const createD1BlueskyTimelineItemsExpiredStore = (db: IoriD1Db): BlueskyTimelineItemsExpiredStore => ({
  expire: async (indexedBefore) => {
    await db.delete(blueskyTimelineItemsTable).where(lt(blueskyTimelineItemsTable.indexedAt, new Date(indexedBefore)));
    return RA.ok(undefined);
  },
});
