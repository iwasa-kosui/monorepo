import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FeedEntryEmbeddingResolverByFeedEntryId } from '../../../domain/feedEntry/feedEntry.ts';
import { Embedding } from '../../../domain/interestSource/embedding.ts';
import type { IoriD1Db } from '../client.ts';
import { feedEntriesTable } from '../schema.ts';

export const createD1FeedEntryEmbeddingResolverByFeedEntryId = (
  db: IoriD1Db,
): FeedEntryEmbeddingResolverByFeedEntryId => ({
  resolve: async (feedEntryId) => {
    const [row] = await db.select({ embedding: feedEntriesTable.embedding }).from(feedEntriesTable)
      .where(eq(feedEntriesTable.feedEntryId, feedEntryId))
      .limit(1);
    return RA.ok(row?.embedding != null && Embedding.validate(row.embedding).ok ? row.embedding : undefined);
  },
});
