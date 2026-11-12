import { useCallback, useRef } from 'hono/jsx';

import type { IoriBlueskyBookmarkResponse } from '../../adaptor/routes/workerIoriBlueskyBookmarkRouter.ts';
import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import {
  blueskyBookmarkFailureMessage,
  bookmarkBlueskyPost,
  bookmarkBlueskyPostByUri,
  unbookmarkBlueskyPost,
  unbookmarkBlueskyPostByUri,
} from '../api/blueskyBookmarkClient.ts';
import { runOptimisticBlueskyBookmark } from './optimisticBlueskyBookmark.ts';
import type { BlueskyItemsUpdater } from './optimisticBlueskyLike.ts';
import { runExclusive } from './optimisticFavourite.ts';

export type UseBlueskyBookmarkReturn = Readonly<{
  bookmark: (item: IoriBlueskyTimelineItemBody) => Promise<void>;
  unbookmark: (item: IoriBlueskyTimelineItemBody) => Promise<void>;
}>;

export type BlueskyBookmarkRequests = Readonly<{
  bookmark: (item: IoriBlueskyTimelineItemBody) => Promise<IoriBlueskyBookmarkResponse>;
  unbookmark: (item: IoriBlueskyTimelineItemBody) => Promise<IoriBlueskyBookmarkResponse>;
}>;

const FEED_ITEM_REQUESTS: BlueskyBookmarkRequests = {
  bookmark: (item) => bookmarkBlueskyPost(item.feedItemId),
  unbookmark: (item) => unbookmarkBlueskyPost(item.feedItemId),
};

export const BLUESKY_BOOKMARK_BY_URI_REQUESTS: BlueskyBookmarkRequests = {
  bookmark: (item) => bookmarkBlueskyPostByUri(item.uri),
  unbookmark: (item) => unbookmarkBlueskyPostByUri(item.uri),
};

export const useBlueskyBookmark = (
  updateItems: BlueskyItemsUpdater,
  requests: BlueskyBookmarkRequests = FEED_ITEM_REQUESTS,
): UseBlueskyBookmarkReturn => {
  const inFlightRef = useRef<Set<string>>(null);
  const inFlight = () => (inFlightRef.current ??= new Set<string>());

  const run = useCallback(
    (item: IoriBlueskyTimelineItemBody, bookmarked: boolean) =>
      runExclusive(inFlight(), item.uri, async () => {
        try {
          await runOptimisticBlueskyBookmark({
            feedItemId: item.feedItemId,
            uri: item.uri,
            bookmarked,
            request: () => (bookmarked ? requests.bookmark(item) : requests.unbookmark(item)),
            updateItems,
          });
        } catch (error) {
          const action = bookmarked ? 'bookmark' : 'remove bookmark';
          console.error(`Failed to ${action}:`, error);
          alert(blueskyBookmarkFailureMessage(action, error));
        }
      }),
    [updateItems, requests],
  );

  const bookmark = useCallback((item: IoriBlueskyTimelineItemBody) => run(item, true), [run]);
  const unbookmark = useCallback((item: IoriBlueskyTimelineItemBody) => run(item, false), [run]);

  return { bookmark, unbookmark } as const;
};
