import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { BlueskyItemsUpdater } from './optimisticBlueskyLike.ts';

type BlueskyItems = readonly IoriBlueskyTimelineItemBody[];

export const withBlueskyBookmarked = (items: BlueskyItems, uri: string, bookmarked: boolean): BlueskyItems =>
  items.map((item) => item.uri === uri && item.bookmarked !== bookmarked ? { ...item, bookmarked } : item);

export const withRestoredBlueskyBookmarked = (
  items: BlueskyItems,
  uri: string,
  before: ReadonlyMap<string, boolean>,
): BlueskyItems =>
  items.map((item) => {
    const restored = item.uri === uri ? before.get(item.feedItemId) : undefined;
    return restored === undefined || restored === item.bookmarked ? item : { ...item, bookmarked: restored };
  });

export const runOptimisticBlueskyBookmark = async ({
  feedItemId,
  uri,
  bookmarked,
  request,
  updateItems,
}: Readonly<{
  feedItemId: string;
  uri: string;
  bookmarked: boolean;
  request: (feedItemId: string) => Promise<Readonly<{ bookmarked: boolean }>>;
  updateItems: BlueskyItemsUpdater;
}>): Promise<void> => {
  const before = new Map<string, boolean>();
  updateItems((items) => {
    for (const item of items) {
      if (item.uri === uri && !before.has(item.feedItemId)) before.set(item.feedItemId, item.bookmarked === true);
    }
    return withBlueskyBookmarked(items, uri, bookmarked);
  });
  let result: Readonly<{ bookmarked: boolean }>;
  try {
    result = await request(feedItemId);
  } catch (error) {
    updateItems((items) => withRestoredBlueskyBookmarked(items, uri, before));
    throw error;
  }
  updateItems((items) => withBlueskyBookmarked(items, uri, result.bookmarked));
};
