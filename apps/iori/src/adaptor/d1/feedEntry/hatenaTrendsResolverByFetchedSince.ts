import { RA } from '@iwasa-kosui/result';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';

import type { HatenaTrendsResolverByFetchedSince } from '../../../domain/digest/digestMaterial.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable, feedSourcesTable } from '../schema.ts';

export const createD1HatenaTrendsResolverByFetchedSince = (
  db: IoriD1Db,
): HatenaTrendsResolverByFetchedSince => ({
  resolve: async ({ fetchedSince, limit }) => {
    const count = sql<number>`max(coalesce(${feedEntriesTable.hatenaBookmarkCount}, 0))`;
    const rows = await db.select({ url: feedEntriesTable.url, title: feedEntriesTable.title, count })
      .from(feedEntriesTable)
      .innerJoin(feedSourcesTable, eq(feedEntriesTable.feedSourceId, feedSourcesTable.feedSourceId))
      .where(and(
        inArray(feedSourcesTable.kind, ['hatena_hotentry', 'hatena_entrylist']),
        eq(feedSourcesTable.enabled, true),
        gte(feedEntriesTable.fetchedAt, new Date(fetchedSince)),
      ))
      .groupBy(feedEntriesTable.url)
      .orderBy(desc(count), asc(feedEntriesTable.url))
      .limit(limit);
    return RA.ok(rows.map((row) => ({ url: row.url, title: row.title, count: Number(row.count) })));
  },
});
