import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FeedEntryResolverByFeedEntryId } from '../../../domain/feedEntry/feedEntry.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable } from '../schema.ts';
import { feedEntrySelection, reconstructFeedEntry } from './feedEntryMapper.ts';

export const createD1FeedEntryResolverByFeedEntryId = (db: IoriD1Db): FeedEntryResolverByFeedEntryId => ({
  resolve: async (feedEntryId) => {
    const [row] = await db.select(feedEntrySelection).from(feedEntriesTable)
      .where(eq(feedEntriesTable.feedEntryId, feedEntryId))
      .limit(1);
    return RA.ok(row === undefined ? undefined : reconstructFeedEntry(row));
  },
});
