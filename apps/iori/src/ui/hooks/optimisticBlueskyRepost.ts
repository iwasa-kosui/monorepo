import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyItemsUpdater } from './optimisticBlueskyLike.ts';

type BlueskyItems = readonly IoriBlueskyTimelineItemBody[];

export const withBlueskyReposted = (items: BlueskyItems, uri: string, reposted: boolean): BlueskyItems =>
  items.map((item) => item.uri === uri && item.reposted !== reposted ? { ...item, reposted } : item);

export const withRestoredBlueskyReposted = (
  items: BlueskyItems,
  uri: string,
  before: ReadonlyMap<string, boolean>,
): BlueskyItems =>
  items.map((item) => {
    const restored = item.uri === uri ? before.get(item.feedItemId) : undefined;
    return restored === undefined || restored === item.reposted ? item : { ...item, reposted: restored };
  });

export const runOptimisticBlueskyRepost = async ({
  feedItemId,
  uri,
  reposted,
  request,
  updateItems,
}: Readonly<{
  feedItemId: string;
  uri: string;
  reposted: boolean;
  request: (feedItemId: string) => Promise<Readonly<{ reposted: boolean }>>;
  updateItems: BlueskyItemsUpdater;
}>): Promise<void> => {
  const before = new Map<string, boolean>();
  updateItems((items) => {
    for (const item of items) {
      if (item.uri === uri && !before.has(item.feedItemId)) before.set(item.feedItemId, item.reposted === true);
    }
    return withBlueskyReposted(items, uri, reposted);
  });
  let result: Readonly<{ reposted: boolean }>;
  try {
    result = await request(feedItemId);
  } catch (error) {
    updateItems((items) => withRestoredBlueskyReposted(items, uri, before));
    throw error;
  }
  updateItems((items) => withBlueskyReposted(items, uri, result.reposted));
};
