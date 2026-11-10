import { RA } from '@iwasa-kosui/result';
import { desc, eq, sql } from 'drizzle-orm';

import type { FeedEntryMaxGuidResolverByFeedSourceId } from '../../../domain/feedEntry/feedEntry.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable } from '../schema.ts';

export const createD1FeedEntryMaxGuidResolverByFeedSourceId = (
  db: IoriD1Db,
): FeedEntryMaxGuidResolverByFeedSourceId => ({
  resolve: async (feedSourceId) => {
    const [row] = await db.select({ guid: feedEntriesTable.guid }).from(feedEntriesTable)
      .where(eq(feedEntriesTable.feedSourceId, feedSourceId))
      .orderBy(desc(sql`length(${feedEntriesTable.guid})`), desc(feedEntriesTable.guid))
      .limit(1);
    return RA.ok(row?.guid);
  },
});
