import { RA } from '@iwasa-kosui/result';
import { and, desc, gte, isNull } from 'drizzle-orm';

import type { FeedEntriesResolverByFetchedSincePendingEmbedding } from '../../../domain/feedEntry/feedEntry.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable } from '../schema.ts';
import { feedEntrySelection, reconstructFeedEntry } from './feedEntryMapper.ts';

export const createD1FeedEntriesResolverByFetchedSincePendingEmbedding = (
  db: IoriD1Db,
): FeedEntriesResolverByFetchedSincePendingEmbedding => ({
  resolve: async ({ fetchedSince, limit }) => {
    const rows = await db.select(feedEntrySelection).from(feedEntriesTable)
      .where(and(
        isNull(feedEntriesTable.embeddedAt),
        gte(feedEntriesTable.fetchedAt, new Date(fetchedSince)),
      ))
      .orderBy(desc(feedEntriesTable.fetchedAt), desc(feedEntriesTable.feedEntryId))
      .limit(limit);
    return RA.ok(rows.map(reconstructFeedEntry));
  },
});
