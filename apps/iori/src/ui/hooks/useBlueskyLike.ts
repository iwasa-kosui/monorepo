import { useCallback, useRef, useState } from 'hono/jsx';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { failureMessage, likeBlueskyPost, unlikeBlueskyPost } from '../api/mastodonClient.ts';
import type { BlueskyItemsUpdater } from './optimisticBlueskyLike.ts';
import { runOptimisticBlueskyLike } from './optimisticBlueskyLike.ts';
import { runExclusive } from './optimisticFavourite.ts';

export type UseBlueskyLikeReturn = Readonly<{
  pendingUris: ReadonlySet<string>;
  like: (item: IoriBlueskyTimelineItemBody) => Promise<void>;
  undoLike: (item: IoriBlueskyTimelineItemBody) => Promise<void>;
}>;

export const useBlueskyLike = (updateItems: BlueskyItemsUpdater): UseBlueskyLikeReturn => {
  const [pendingUris, setPendingUris] = useState<ReadonlySet<string>>(new Set());
  const inFlightRef = useRef<Set<string>>(null);
  const inFlight = () => (inFlightRef.current ??= new Set<string>());

  const run = useCallback(
    (item: IoriBlueskyTimelineItemBody, liked: boolean) =>
      runExclusive(inFlight(), item.uri, async () => {
        setPendingUris((prev) => new Set(prev).add(item.uri));
        try {
          await runOptimisticBlueskyLike({
            feedItemId: item.feedItemId,
            uri: item.uri,
            liked,
            request: liked ? likeBlueskyPost : unlikeBlueskyPost,
            updateItems,
          });
        } catch (error) {
          const action = liked ? 'like' : 'undo like';
          console.error(`Failed to ${action}:`, error);
          alert(failureMessage(action, error));
        } finally {
          setPendingUris((prev) => {
            const next = new Set(prev);
            next.delete(item.uri);
            return next;
          });
        }
      }),
    [updateItems],
  );

  const like = useCallback((item: IoriBlueskyTimelineItemBody) => run(item, true), [run]);
  const undoLike = useCallback((item: IoriBlueskyTimelineItemBody) => run(item, false), [run]);

  return { pendingUris, like, undoLike } as const;
};
