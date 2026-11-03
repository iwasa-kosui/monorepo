import type { FeedEntry } from '../../../domain/feedEntry/feedEntry.ts';
import { FeedEntryId } from '../../../domain/feedEntry/feedEntryId.ts';
import { FeedSourceId } from '../../../domain/feedSource/feedSourceId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { feedEntriesTable } from '../schema.ts';

export const reconstructFeedEntry = (row: typeof feedEntriesTable.$inferSelect): FeedEntry => ({
  feedEntryId: FeedEntryId.orThrow(row.feedEntryId),
  feedSourceId: FeedSourceId.orThrow(row.feedSourceId),
  guid: row.guid,
  url: row.url,
  title: row.title,
  description: row.description,
  publishedAt: row.publishedAt === null ? null : Instant.orThrow(row.publishedAt.getTime()),
  hatenaBookmarkCount: row.hatenaBookmarkCount,
  fetchedAt: Instant.orThrow(row.fetchedAt.getTime()),
});
