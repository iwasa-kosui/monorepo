import type { FeedSource, FeedSourceKind } from '../../../domain/feedSource/feedSource.ts';
import { FeedSourceId } from '../../../domain/feedSource/feedSourceId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { feedSourcesTable } from '../schema.ts';

export const reconstructFeedSource = (row: typeof feedSourcesTable.$inferSelect): FeedSource => ({
  feedSourceId: FeedSourceId.orThrow(row.feedSourceId),
  kind: row.kind as FeedSourceKind,
  url: row.url,
  title: row.title,
  enabled: row.enabled,
  etag: row.etag,
  lastModified: row.lastModified,
  lastFetchedAt: row.lastFetchedAt === null ? null : Instant.orThrow(row.lastFetchedAt.getTime()),
  lastError: row.lastError,
  createdAt: Instant.orThrow(row.createdAt.getTime()),
});
