import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';

type BlueskyItems = readonly IoriBlueskyTimelineItemBody[];

export type BlueskyItemsUpdater = (updater: (items: BlueskyItems) => BlueskyItems) => void;

export const withBlueskyLiked = (items: BlueskyItems, uri: string, liked: boolean): BlueskyItems =>
  items.map((item) => item.uri === uri && item.liked !== liked ? { ...item, liked } : item);

export const withRestoredBlueskyLiked = (
  items: BlueskyItems,
  uri: string,
  before: ReadonlyMap<string, boolean>,
): BlueskyItems =>
  items.map((item) => {
    const restored = item.uri === uri ? before.get(item.feedItemId) : undefined;
    return restored === undefined || restored === item.liked ? item : { ...item, liked: restored };
  });

export const runOptimisticBlueskyLike = async ({
  feedItemId,
  uri,
  liked,
  request,
  updateItems,
}: Readonly<{
  feedItemId: string;
  uri: string;
  liked: boolean;
  request: (feedItemId: string) => Promise<Readonly<{ liked: boolean }>>;
  updateItems: BlueskyItemsUpdater;
}>): Promise<void> => {
  const before = new Map<string, boolean>();
  updateItems((items) => {
    for (const item of items) {
      if (item.uri === uri && !before.has(item.feedItemId)) before.set(item.feedItemId, item.liked === true);
    }
    return withBlueskyLiked(items, uri, liked);
  });
  let result: Readonly<{ liked: boolean }>;
  try {
    result = await request(feedItemId);
  } catch (error) {
    updateItems((items) => withRestoredBlueskyLiked(items, uri, before));
    throw error;
  }
  updateItems((items) => withBlueskyLiked(items, uri, result.liked));
};
