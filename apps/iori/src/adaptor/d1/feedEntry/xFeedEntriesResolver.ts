import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, sql } from 'drizzle-orm';

import { FeedEntryId } from '../../../domain/feedEntry/feedEntryId.ts';
import type { XFeedEntriesResolver } from '../../../domain/feedEntry/xFeedEntry.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable, feedSourcesTable } from '../schema.ts';

export const createD1XFeedEntriesResolver = (db: IoriD1Db): XFeedEntriesResolver => ({
  resolve: async ({ limit }) => {
    const rows = await db.select({
      feedEntryId: feedEntriesTable.feedEntryId,
      sourceTitle: feedSourcesTable.title,
      text: feedEntriesTable.description,
      url: feedEntriesTable.url,
      publishedAt: feedEntriesTable.publishedAt,
      fetchedAt: feedEntriesTable.fetchedAt,
    }).from(feedEntriesTable)
      .innerJoin(feedSourcesTable, eq(feedEntriesTable.feedSourceId, feedSourcesTable.feedSourceId))
      .where(and(eq(feedSourcesTable.kind, 'x_user'), eq(feedSourcesTable.enabled, true)))
      .orderBy(
        desc(sql`coalesce(${feedEntriesTable.publishedAt}, ${feedEntriesTable.fetchedAt})`),
        desc(feedEntriesTable.feedEntryId),
      )
      .limit(limit);
    return RA.ok(rows.map((row) => ({
      feedEntryId: FeedEntryId.orThrow(row.feedEntryId),
      sourceTitle: row.sourceTitle,
      text: row.text,
      url: row.url,
      postedAt: Instant.orThrow((row.publishedAt ?? row.fetchedAt).getTime()),
    })));
  },
});
