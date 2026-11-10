import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { BlueskyRepostTargetResolver } from '../../../domain/blueskyTimeline/blueskyRepost.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyRepostsTable, blueskyTimelineItemsTable } from '../schema.ts';

export const createD1BlueskyRepostTargetResolver = (db: IoriD1Db): BlueskyRepostTargetResolver => ({
  resolve: async (feedItemId) => {
    const [row] = await db.select({
      uri: blueskyTimelineItemsTable.uri,
      cid: blueskyTimelineItemsTable.cid,
      repostUri: blueskyRepostsTable.repostUri,
    })
      .from(blueskyTimelineItemsTable)
      .leftJoin(blueskyRepostsTable, eq(blueskyRepostsTable.subjectUri, blueskyTimelineItemsTable.uri))
      .where(eq(blueskyTimelineItemsTable.feedItemId, feedItemId))
      .limit(1);
    return RA.ok(row);
  },
});
