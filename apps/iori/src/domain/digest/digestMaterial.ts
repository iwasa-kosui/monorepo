import type { Agg } from '../aggregate/index.ts';
import type { FeedEntry } from '../feedEntry/feedEntry.ts';
import type { Instant } from '../instant/instant.ts';
import type { UserId } from '../user/userId.ts';

export type TrendCandidate = Readonly<{
  url: string;
  title: string;
  count: number;
}>;

export type RadarFeedEntriesResolverByFetchedSince = Agg.Resolver<
  { fetchedSince: Instant; limit: number },
  ReadonlyArray<FeedEntry>
>;
export type HatenaTrendsResolverByFetchedSince = Agg.Resolver<
  { fetchedSince: Instant; limit: number },
  ReadonlyArray<TrendCandidate>
>;
export type TimelineLinkTrendsResolverByUserId = Agg.Resolver<
  { userId: UserId; createdSince: Instant; limit: number },
  ReadonlyArray<TrendCandidate>
>;
