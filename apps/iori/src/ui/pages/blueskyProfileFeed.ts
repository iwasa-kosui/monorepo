import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyAuthorFeedFilter } from '../../ports/blueskyProfileReader.ts';

type ItemsUpdater = (items: readonly IoriBlueskyTimelineItemBody[]) => readonly IoriBlueskyTimelineItemBody[];

export const withFeedItems = <F extends Readonly<{ items: readonly IoriBlueskyTimelineItemBody[] }>>(
  feed: F | null,
  updater: ItemsUpdater,
): F | null => {
  if (feed === null) return feed;
  const items = updater(feed.items);
  return items === feed.items ? feed : { ...feed, items };
};

type CachedFeed = Readonly<{ items: readonly IoriBlueskyTimelineItemBody[]; failed: boolean }>;

export type FeedCache<F extends CachedFeed> = Readonly<{
  actor: string | undefined;
  feeds: Readonly<Partial<Record<BlueskyAuthorFeedFilter, F>>>;
}>;

export const emptyFeedCache = <F extends CachedFeed>(): FeedCache<F> => ({ actor: undefined, feeds: {} });

const feedsOfActor = <F extends CachedFeed>(cache: FeedCache<F>, actor: string): FeedCache<F>['feeds'] =>
  cache.actor === actor ? cache.feeds : {};

export const cachedFeedOf = <F extends CachedFeed>(
  cache: FeedCache<F>,
  actor: string | undefined,
  filter: BlueskyAuthorFeedFilter | undefined,
): F | undefined => (actor === undefined || filter === undefined ? undefined : feedsOfActor(cache, actor)[filter]);

export const shouldFetchFeed = <F extends CachedFeed>(
  cache: FeedCache<F> | null,
  actor: string | undefined,
  filter: BlueskyAuthorFeedFilter | undefined,
): boolean => {
  if (actor === undefined || filter === undefined) return false;
  if (cache === null) return true;
  const cached = cachedFeedOf(cache, actor, filter);
  return cached === undefined || cached.failed;
};

export const withCachedFeed = <F extends CachedFeed>(
  cache: FeedCache<F>,
  actor: string,
  filter: BlueskyAuthorFeedFilter,
  feed: F,
): FeedCache<F> => ({ actor, feeds: { ...feedsOfActor(cache, actor), [filter]: feed } });

export const withoutCachedFeed = <F extends CachedFeed>(
  cache: FeedCache<F>,
  actor: string,
  filter: BlueskyAuthorFeedFilter,
): FeedCache<F> => {
  const { [filter]: _removed, ...rest } = feedsOfActor(cache, actor);
  return { actor, feeds: rest };
};

export const withUpdatedCachedFeed = <F extends CachedFeed>(
  cache: FeedCache<F>,
  actor: string,
  filter: BlueskyAuthorFeedFilter,
  update: (feed: F) => F,
): FeedCache<F> => {
  const feed = cachedFeedOf(cache, actor, filter);
  return feed === undefined || cache.actor !== actor ? cache : withCachedFeed(cache, actor, filter, update(feed));
};

export const withCachedFeedItems = <F extends CachedFeed>(
  cache: FeedCache<F>,
  updater: ItemsUpdater,
): FeedCache<F> => {
  let changed = false;
  const feeds: Partial<Record<BlueskyAuthorFeedFilter, F>> = {};
  for (const [filter, feed] of Object.entries(cache.feeds) as [BlueskyAuthorFeedFilter, F][]) {
    const next = withFeedItems(feed, updater) ?? feed;
    if (next !== feed) changed = true;
    feeds[filter] = next;
  }
  return changed ? { actor: cache.actor, feeds } : cache;
};
