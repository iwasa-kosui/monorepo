import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

import type { NewFeedEntriesResolverByFetchedSince } from '../../../domain/digest/digestMaterial.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable, feedSourcesTable } from '../schema.ts';
import { feedEntrySelection, reconstructFeedEntry } from './feedEntryMapper.ts';

const OVERFETCH_FACTOR = 5;

export const createD1NewFeedEntriesResolverByFetchedSince = (
  db: IoriD1Db,
): NewFeedEntriesResolverByFetchedSince => ({
  resolve: async ({ fetchedSince, limit }) => {
    const rows = await db.select({ entry: feedEntrySelection }).from(feedEntriesTable)
      .innerJoin(feedSourcesTable, eq(feedEntriesTable.feedSourceId, feedSourcesTable.feedSourceId))
      .where(and(
        eq(feedSourcesTable.kind, 'rss'),
        gte(feedEntriesTable.fetchedAt, new Date(fetchedSince)),
      ))
      .orderBy(
        desc(feedEntriesTable.hatenaBookmarkCount),
        desc(sql`coalesce(${feedEntriesTable.publishedAt}, ${feedEntriesTable.fetchedAt})`),
        desc(feedEntriesTable.feedEntryId),
      )
      .limit(limit * OVERFETCH_FACTOR);
    const seenUrls = new Set<string>();
    const distinct = rows.filter(({ entry }) => !seenUrls.has(entry.url) && seenUrls.add(entry.url));
    return RA.ok(distinct.slice(0, limit).map((row) => reconstructFeedEntry(row.entry)));
  },
});
