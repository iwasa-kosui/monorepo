import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray } from 'drizzle-orm';

import type { FeedEntriesResolverByFeedSourceIdAndGuids } from '../../../domain/feedEntry/feedEntry.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable } from '../schema.ts';
import { feedEntrySelection, reconstructFeedEntry } from './feedEntryMapper.ts';

export const createD1FeedEntriesResolverByFeedSourceIdAndGuids = (
  db: IoriD1Db,
): FeedEntriesResolverByFeedSourceIdAndGuids => ({
  resolve: async ({ feedSourceId, guids }) => {
    if (guids.length === 0) return RA.ok([]);
    const rows = await db.select(feedEntrySelection).from(feedEntriesTable).where(
      and(eq(feedEntriesTable.feedSourceId, feedSourceId), inArray(feedEntriesTable.guid, [...guids])),
    );
    return RA.ok(rows.map(reconstructFeedEntry));
  },
});
