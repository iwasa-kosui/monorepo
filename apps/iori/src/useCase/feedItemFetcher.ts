import type { ParsedFeedItem } from '../adaptor/feed/parseFeed.ts';
import type { FeedSource } from '../domain/feedSource/feedSource.ts';

export type FetchedFeedItems = Readonly<{
  source: FeedSource;
  items: ReadonlyArray<ParsedFeedItem>;
  retentionDays: number;
  validators: Readonly<{ etag: string | null; lastModified: string | null }>;
}>;

export type FeedItemFetcher = (source: FeedSource) => Promise<FetchedFeedItems>;
