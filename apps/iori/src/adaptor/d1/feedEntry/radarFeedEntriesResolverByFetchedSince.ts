import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, gte } from 'drizzle-orm';

import type { RadarFeedEntriesResolverByFetchedSince } from '../../../domain/digest/digestMaterial.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable, feedSourcesTable } from '../schema.ts';
import { reconstructFeedEntry } from './feedEntryMapper.ts';

export const createD1RadarFeedEntriesResolverByFetchedSince = (
  db: IoriD1Db,
): RadarFeedEntriesResolverByFetchedSince => ({
  resolve: async ({ fetchedSince, limit }) => {
    const rows = await db.select({ entry: feedEntriesTable }).from(feedEntriesTable)
      .innerJoin(feedSourcesTable, eq(feedEntriesTable.feedSourceId, feedSourcesTable.feedSourceId))
      .where(and(
        eq(feedSourcesTable.kind, 'thoughtworks_radar'),
        gte(feedEntriesTable.fetchedAt, new Date(fetchedSince)),
      ))
      .orderBy(
        desc(feedEntriesTable.publishedAt),
        desc(feedEntriesTable.fetchedAt),
        desc(feedEntriesTable.feedEntryId),
      )
      .limit(limit);
    return RA.ok(rows.map((row) => reconstructFeedEntry(row.entry)));
  },
});
