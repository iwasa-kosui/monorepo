import { RA } from '@iwasa-kosui/result';
import { and, inArray, notInArray, sql } from 'drizzle-orm';

import type { FeedEntriesResolverByFetchedBefore } from '../../../domain/feedEntry/feedEntry.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable, feedSourcesTable } from '../schema.ts';
import { feedEntrySelection, reconstructFeedEntry } from './feedEntryMapper.ts';

export const createD1FeedEntriesResolverByFetchedBefore = (db: IoriD1Db): FeedEntriesResolverByFetchedBefore => ({
  resolve: async ({ fetchedBefore, limit, kinds, excludedKinds }) => {
    if (kinds?.length === 0) return RA.ok([]);
    const sourceIdsOf = (condition: ReturnType<typeof inArray>) =>
      db.select({ feedSourceId: feedSourcesTable.feedSourceId }).from(feedSourcesTable).where(condition);
    const rows = await db.select(feedEntrySelection).from(feedEntriesTable)
      .where(and(
        sql`coalesce(${feedEntriesTable.publishedAt}, ${feedEntriesTable.fetchedAt}) < ${fetchedBefore}`,
        kinds === undefined
          ? undefined
          : inArray(feedEntriesTable.feedSourceId, sourceIdsOf(inArray(feedSourcesTable.kind, [...kinds]))),
        excludedKinds === undefined || excludedKinds.length === 0
          ? undefined
          : notInArray(
            feedEntriesTable.feedSourceId,
            sourceIdsOf(inArray(feedSourcesTable.kind, [...excludedKinds])),
          ),
      ))
      .limit(limit);
    return RA.ok(rows.map(reconstructFeedEntry));
  },
});
