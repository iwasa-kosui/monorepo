import { RA } from '@iwasa-kosui/result';
import { sql } from 'drizzle-orm';

import type { FeedEntriesResolverByFetchedBefore } from '../../../domain/feedEntry/feedEntry.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable, feedSourcesTable } from '../schema.ts';
import { feedEntrySelection, reconstructFeedEntry } from './feedEntryMapper.ts';

export const createD1FeedEntriesResolverByFetchedBefore = (db: IoriD1Db): FeedEntriesResolverByFetchedBefore => ({
  resolve: async ({ fetchedBefore, limit }) => {
    const rows = await db.select(feedEntrySelection).from(feedEntriesTable)
      .where(sql`coalesce(${feedEntriesTable.publishedAt}, ${feedEntriesTable.fetchedAt}) < ${fetchedBefore}
        and ${feedEntriesTable.feedSourceId} not in (
          select ${feedSourcesTable.feedSourceId} from ${feedSourcesTable} where ${feedSourcesTable.kind} = 'thoughtworks_radar'
        )`)
      .limit(limit);
    return RA.ok(rows.map(reconstructFeedEntry));
  },
});
