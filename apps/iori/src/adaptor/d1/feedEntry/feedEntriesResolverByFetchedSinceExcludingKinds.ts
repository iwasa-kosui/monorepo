import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, gte, notInArray } from 'drizzle-orm';

import type { FeedEntriesResolverByFetchedSinceExcludingKinds } from '../../../domain/feedEntry/feedEntry.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable, feedSourcesTable } from '../schema.ts';
import { feedEntrySelection, reconstructFeedEntry } from './feedEntryMapper.ts';

export const createD1FeedEntriesResolverByFetchedSinceExcludingKinds = (
  db: IoriD1Db,
): FeedEntriesResolverByFetchedSinceExcludingKinds => ({
  resolve: async ({ fetchedSince, excludedKinds, limit }) => {
    const rows = await db.select({ entry: feedEntrySelection }).from(feedEntriesTable)
      .innerJoin(feedSourcesTable, eq(feedEntriesTable.feedSourceId, feedSourcesTable.feedSourceId))
      .where(and(
        gte(feedEntriesTable.fetchedAt, new Date(fetchedSince)),
        notInArray(feedSourcesTable.kind, [...excludedKinds]),
      ))
      .orderBy(desc(feedEntriesTable.fetchedAt))
      .limit(limit);
    return RA.ok(rows.map(({ entry }) => reconstructFeedEntry(entry)));
  },
});
