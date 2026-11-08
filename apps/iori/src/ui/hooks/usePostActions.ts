import { useCallback, useRef, useState } from 'hono/jsx';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import {
  deleteStatus,
  failureMessage,
  favourite,
  react,
  reblog,
  unfavourite,
  unreact,
  unreblog,
} from '../api/mastodonClient.ts';
import { withReblogged, withUpdatedStatus } from '../api/status.ts';
import { runExclusive, runOptimisticFavourite } from './optimisticFavourite.ts';

type StatusUpdater = (
  postId: string,
  updater: (status: Status) => Status,
) => void;

export type ActionState = Readonly<{
  likingPostId: string | null;
  undoingLikePostId: string | null;
  repostingPostId: string | null;
  undoingRepostPostId: string | null;
  deletingPostId: string | null;
  emojiReactingPostId: string | null;
  myReactions: ReadonlyMap<string, readonly string[]>;
}>;

export type UsePostActionsReturn = Readonly<{
  actionState: ActionState;
  like: (postId: string) => Promise<void>;
  undoLike: (postId: string) => Promise<void>;
  repost: (postId: string) => Promise<void>;
  undoRepost: (postId: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  emojiReact: (postId: string, emoji: string) => Promise<void>;
  undoEmojiReact: (postId: string, emoji: string) => Promise<void>;
}>;

type UsePostActionsProps = Readonly<{
  updateTimelineItem: StatusUpdater;
  updateThreadPost?: StatusUpdater;
  removePost: (postId: string) => void;
  refreshTimeline: () => Promise<void>;
  onPostDeleted?: (postId: string) => void;
}>;

export const usePostActions = ({
  updateTimelineItem,
  updateThreadPost,
  removePost,
  refreshTimeline,
  onPostDeleted,
}: UsePostActionsProps): UsePostActionsReturn => {
  const [likingPostId, setLikingPostId] = useState<string | null>(null);
  const [undoingLikePostId, setUndoingLikePostId] = useState<string | null>(null);
  const [repostingPostId, setRepostingPostId] = useState<string | null>(null);
  const [undoingRepostPostId, setUndoingRepostPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [emojiReactingPostId, setEmojiReactingPostId] = useState<string | null>(null);
  const [myReactions, setMyReactions] = useState<Map<string, string[]>>(new Map());
  const favouriteInFlightRef = useRef<Set<string>>(null);
  const favouriteInFlight = () => (favouriteInFlightRef.current ??= new Set<string>());

  const like = useCallback(
    (postId: string) =>
      runExclusive(favouriteInFlight(), postId, async () => {
        setLikingPostId(postId);
        try {
          await runOptimisticFavourite({
            postId,
            favourited: true,
            request: favourite,
            updateTimelineItem,
            updateThreadPost,
          });
        } catch (error) {
          console.error('Failed to like:', error);
        } finally {
          setLikingPostId(null);
        }
      }),
    [updateTimelineItem, updateThreadPost],
  );

  const undoLike = useCallback(
    (postId: string) =>
      runExclusive(favouriteInFlight(), postId, async () => {
        setUndoingLikePostId(postId);
        try {
          await runOptimisticFavourite({
            postId,
            favourited: false,
            request: unfavourite,
            updateTimelineItem,
            updateThreadPost,
          });
        } catch (error) {
          console.error('Failed to undo like:', error);
          alert(failureMessage('undo like', error));
        } finally {
          setUndoingLikePostId(null);
        }
      }),
    [updateTimelineItem, updateThreadPost],
  );

  const repost = useCallback(
    async (postId: string) => {
      setRepostingPostId(postId);
      try {
        const boost = await reblog(postId);
        await refreshTimeline();
        const original = boost.reblog;
        updateThreadPost?.(
          postId,
          (status) => original === null ? withReblogged(status, true) : withUpdatedStatus(status, original),
        );
      } catch (error) {
        console.error('Failed to repost:', error);
        alert(failureMessage('repost', error));
      } finally {
        setRepostingPostId(null);
      }
    },
    [refreshTimeline, updateThreadPost],
  );

  const undoRepost = useCallback(
    async (postId: string) => {
      if (!confirm('Are you sure you want to undo this repost?')) {
        return;
      }
      setUndoingRepostPostId(postId);
      try {
        const original = await unreblog(postId);
        await refreshTimeline();
        updateThreadPost?.(postId, (status) => withUpdatedStatus(status, original));
      } catch (error) {
        console.error('Failed to undo repost:', error);
        alert(failureMessage('undo repost', error));
      } finally {
        setUndoingRepostPostId(null);
      }
    },
    [refreshTimeline, updateThreadPost],
  );

  const deletePost = useCallback(
    async (postId: string) => {
      setDeletingPostId(postId);
      try {
        await deleteStatus(postId);
        removePost(postId);
        onPostDeleted?.(postId);
      } catch (error) {
        console.error('Failed to delete:', error);
        alert(failureMessage('delete', error));
      } finally {
        setDeletingPostId(null);
      }
    },
    [removePost, onPostDeleted],
  );

  const emojiReact = useCallback(async (postId: string, emoji: string) => {
    setEmojiReactingPostId(postId);
    try {
      const updated = await react(postId, emoji);
      updateTimelineItem(postId, (status) => withUpdatedStatus(status, updated));
      updateThreadPost?.(postId, (status) => withUpdatedStatus(status, updated));
      setMyReactions((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(postId) ?? [];
        if (!existing.includes(emoji)) {
          newMap.set(postId, [...existing, emoji]);
        }
        return newMap;
      });
    } catch (error) {
      console.error('Failed to react:', error);
      alert(failureMessage('add reaction', error));
    } finally {
      setEmojiReactingPostId(null);
    }
  }, [updateTimelineItem, updateThreadPost]);

  const undoEmojiReact = useCallback(async (postId: string, emoji: string) => {
    setEmojiReactingPostId(postId);
    try {
      const updated = await unreact(postId, emoji);
      updateTimelineItem(postId, (status) => withUpdatedStatus(status, updated));
      updateThreadPost?.(postId, (status) => withUpdatedStatus(status, updated));
      setMyReactions((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(postId) ?? [];
        newMap.set(
          postId,
          existing.filter((e) => e !== emoji),
        );
        return newMap;
      });
    } catch (error) {
      console.error('Failed to undo react:', error);
      alert(failureMessage('remove reaction', error));
    } finally {
      setEmojiReactingPostId(null);
    }
  }, [updateTimelineItem, updateThreadPost]);

  return {
    actionState: {
      likingPostId,
      undoingLikePostId,
      repostingPostId,
      undoingRepostPostId,
      deletingPostId,
      emojiReactingPostId,
      myReactions,
    },
    like,
    undoLike,
    repost,
    undoRepost,
    deletePost,
    emojiReact,
    undoEmojiReact,
  } as const;
};
