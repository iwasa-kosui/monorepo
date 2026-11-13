import { useCallback, useRef } from 'hono/jsx';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { blueskyFailureMessage, deleteBlueskyPost } from '../api/mastodonClient.ts';
import type { BlueskyItemsUpdater } from './optimisticBlueskyLike.ts';
import { runExclusive } from './optimisticFavourite.ts';

export const BLUESKY_DELETE_POST_CONFIRMATION =
  'この投稿を削除しますか？ iori からクロスポストした投稿は、iori と Fediverse からも削除します。';

export type UseBlueskyDeletePostOptions = Readonly<{
  onPostDeleted?: (item: IoriBlueskyTimelineItemBody) => void;
  onCrosspostDeleted?: (postId: string) => void;
}>;

export type UseBlueskyDeletePostReturn = Readonly<{
  onDeletePost: (item: IoriBlueskyTimelineItemBody) => Promise<void>;
}>;

export const withoutBlueskyPost = (
  items: readonly IoriBlueskyTimelineItemBody[],
  uri: string,
): readonly IoriBlueskyTimelineItemBody[] => {
  const kept = items.filter((item) => item.uri !== uri);
  return kept.length === items.length ? items : kept;
};

export const useBlueskyDeletePost = (
  updateItems: BlueskyItemsUpdater,
  options: UseBlueskyDeletePostOptions = {},
): UseBlueskyDeletePostReturn => {
  const { onPostDeleted, onCrosspostDeleted } = options;
  const inFlightRef = useRef<Set<string>>(null);
  const inFlight = () => (inFlightRef.current ??= new Set<string>());

  const onDeletePost = useCallback(
    (item: IoriBlueskyTimelineItemBody) =>
      runExclusive(inFlight(), item.uri, async () => {
        if (!confirm(BLUESKY_DELETE_POST_CONFIRMATION)) return;
        let deleted;
        try {
          deleted = await deleteBlueskyPost(item.uri);
        } catch (error) {
          console.error('Failed to delete post:', error);
          alert(blueskyFailureMessage('delete post', error));
          return;
        }
        updateItems((items) => withoutBlueskyPost(items, item.uri));
        if (deleted.viaCrosspost) onCrosspostDeleted?.(deleted.postId);
        onPostDeleted?.(item);
      }),
    [updateItems, onPostDeleted, onCrosspostDeleted],
  );

  return { onDeletePost } as const;
};
