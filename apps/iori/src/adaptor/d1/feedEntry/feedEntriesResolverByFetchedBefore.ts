import { RA } from '@iwasa-kosui/result';
import { sql } from 'drizzle-orm';

import type { FeedEntriesResolverByFetchedBefore } from '../../../domain/feedEntry/feedEntry.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable } from '../schema.ts';
import { reconstructFeedEntry } from './feedEntryMapper.ts';

export const createD1FeedEntriesResolverByFetchedBefore = (db: IoriD1Db): FeedEntriesResolverByFetchedBefore => ({
  resolve: async ({ fetchedBefore, limit }) => {
    const rows = await db.select().from(feedEntriesTable)
      .where(sql`coalesce(${feedEntriesTable.publishedAt}, ${feedEntriesTable.fetchedAt}) < ${fetchedBefore}`)
      .limit(limit);
    return RA.ok(rows.map(reconstructFeedEntry));
  },
});
