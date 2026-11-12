import { useCallback, useRef, useState } from 'hono/jsx';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { blueskyFailureMessage, repostBlueskyPost, undoRepostBlueskyPost } from '../api/mastodonClient.ts';
import type { BlueskyItemsUpdater } from './optimisticBlueskyLike.ts';
import { runOptimisticBlueskyRepost } from './optimisticBlueskyRepost.ts';
import { runExclusive } from './optimisticFavourite.ts';

export type UseBlueskyRepostReturn = Readonly<{
  pendingUris: ReadonlySet<string>;
  repost: (item: IoriBlueskyTimelineItemBody) => Promise<void>;
  undoRepost: (item: IoriBlueskyTimelineItemBody) => Promise<void>;
}>;

export const useBlueskyRepost = (updateItems: BlueskyItemsUpdater): UseBlueskyRepostReturn => {
  const [pendingUris, setPendingUris] = useState<ReadonlySet<string>>(new Set());
  const inFlightRef = useRef<Set<string>>(null);
  const inFlight = () => (inFlightRef.current ??= new Set<string>());

  const run = useCallback(
    (item: IoriBlueskyTimelineItemBody, reposted: boolean) =>
      runExclusive(inFlight(), item.uri, async () => {
        setPendingUris((prev) => new Set(prev).add(item.uri));
        try {
          await runOptimisticBlueskyRepost({
            feedItemId: item.feedItemId,
            uri: item.uri,
            reposted,
            request: reposted ? repostBlueskyPost : undoRepostBlueskyPost,
            updateItems,
          });
        } catch (error) {
          const action = reposted ? 'repost' : 'undo repost';
          console.error(`Failed to ${action}:`, error);
          alert(blueskyFailureMessage(action, error));
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

  const repost = useCallback((item: IoriBlueskyTimelineItemBody) => run(item, true), [run]);
  const undoRepost = useCallback((item: IoriBlueskyTimelineItemBody) => run(item, false), [run]);

  return { pendingUris, repost, undoRepost } as const;
};
