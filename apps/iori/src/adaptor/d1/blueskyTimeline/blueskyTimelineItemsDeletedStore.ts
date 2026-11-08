import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { BlueskyTimelineItemsDeletedStore } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyTimelineItemsTable } from '../schema.ts';

export const createD1BlueskyTimelineItemsDeletedStore = (db: IoriD1Db): BlueskyTimelineItemsDeletedStore => ({
  deleteByUri: async (uri) => {
    await db.delete(blueskyTimelineItemsTable).where(eq(blueskyTimelineItemsTable.uri, uri));
    return RA.ok(undefined);
  },
});
