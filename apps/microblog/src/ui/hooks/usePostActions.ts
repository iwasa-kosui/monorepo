import { hc } from 'hono/client';
import { useCallback, useState } from 'hono/jsx';

import type { APIRouterType } from '../../adaptor/routes/apiRouter.tsx';
import type { PostQuery } from '../../domain/post/post.ts';
import type { TimelineItemWithPost } from '../../domain/timeline/timelineItem.ts';

const client = hc<APIRouterType>('/api');

type PostUpdater = (
  postId: string,
  updater: (item: TimelineItemWithPost) => TimelineItemWithPost,
) => void;

type ThreadPostUpdater = (
  postId: string,
  updater: (post: PostQuery) => PostQuery,
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
  updateTimelineItem: PostUpdater;
  updateThreadPost?: ThreadPostUpdater;
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

  const like = useCallback(
    async (postId: string) => {
      setLikingPostId(postId);
      try {
        const res = await client.v1.like.$post({ json: { postId } });
        const result = await res.json();
        if ('success' in result && result.success) {
          updateTimelineItem(postId, (item) => ({
            ...item,
            post: { ...item.post, liked: true },
          }));
          updateThreadPost?.(postId, (post) => ({ ...post, liked: true }));
        } else if ('error' in result) {
          console.error('Failed to like:', result.error);
        }
      } catch (error) {
        console.error('Failed to like:', error);
      } finally {
        setLikingPostId(null);
      }
    },
    [updateTimelineItem, updateThreadPost],
  );

  const undoLike = useCallback(
    async (postId: string) => {
      setUndoingLikePostId(postId);
      try {
        const res = await client.v1.like.$delete({ json: { postId } });
        const result = await res.json();
        if ('success' in result && result.success) {
          updateTimelineItem(postId, (item) => ({
            ...item,
            post: { ...item.post, liked: false },
          }));
          updateThreadPost?.(postId, (post) => ({ ...post, liked: false }));
        } else if ('error' in result) {
          console.error('Failed to undo like:', result.error);
          alert(`Failed to undo like: ${result.error}`);
        }
      } catch (error) {
        console.error('Failed to undo like:', error);
        alert('Failed to undo like. Please try again.');
      } finally {
        setUndoingLikePostId(null);
      }
    },
    [updateTimelineItem, updateThreadPost],
  );

  const repost = useCallback(
    async (postId: string) => {
      setRepostingPostId(postId);
      try {
        const res = await client.v1.repost.$post({ json: { postId } });
        const result = await res.json();
        if ('success' in result && result.success) {
          await refreshTimeline();
          updateThreadPost?.(postId, (post) => ({ ...post, reposted: true }));
        } else if ('error' in result) {
          console.error('Failed to repost:', result.error);
          alert(`Failed to repost: ${result.error}`);
        }
      } catch (error) {
        console.error('Failed to repost:', error);
        alert('Failed to repost. Please try again.');
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
        const res = await client.v1.repost.$delete({ json: { postId } });
        const result = await res.json();
        if ('success' in result && result.success) {
          await refreshTimeline();
          updateThreadPost?.(postId, (post) => ({ ...post, reposted: false }));
        } else if ('error' in result) {
          console.error('Failed to undo repost:', result.error);
          alert(`Failed to undo repost: ${result.error}`);
        }
      } catch (error) {
        console.error('Failed to undo repost:', error);
        alert('Failed to undo repost. Please try again.');
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
        const res = await client.v1.posts[':postId'].$delete({
          param: { postId },
        });
        const result = await res.json();
        if ('success' in result && result.success) {
          removePost(postId);
          onPostDeleted?.(postId);
        } else if ('error' in result) {
          console.error('Failed to delete:', result.error);
          alert(`Failed to delete: ${result.error}`);
        }
      } catch (error) {
        console.error('Failed to delete:', error);
        alert('Failed to delete the post. Please try again.');
      } finally {
        setDeletingPostId(null);
      }
    },
    [removePost, onPostDeleted],
  );

  const emojiReact = useCallback(async (postId: string, emoji: string) => {
    setEmojiReactingPostId(postId);
    try {
      const res = await client.v1.react.$post({ json: { postId, emoji } });
      const result = await res.json();
      if ('success' in result && result.success) {
        setMyReactions((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(postId) ?? [];
          if (!existing.includes(emoji)) {
            newMap.set(postId, [...existing, emoji]);
          }
          return newMap;
        });
      } else if ('error' in result) {
        console.error('Failed to react:', result.error);
        alert(`Failed to react: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to react:', error);
      alert('Failed to add reaction. Please try again.');
    } finally {
      setEmojiReactingPostId(null);
    }
  }, []);

  const undoEmojiReact = useCallback(async (postId: string, emoji: string) => {
    setEmojiReactingPostId(postId);
    try {
      const res = await client.v1.react.$delete({ json: { postId, emoji } });
      const result = await res.json();
      if ('success' in result && result.success) {
        setMyReactions((prev) => {
          const newMap = new Map(prev);
          const existing = newMap.get(postId) ?? [];
          newMap.set(
            postId,
            existing.filter((e) => e !== emoji),
          );
          return newMap;
        });
      } else if ('error' in result) {
        console.error('Failed to undo react:', result.error);
        alert(`Failed to undo reaction: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to undo react:', error);
      alert('Failed to remove reaction. Please try again.');
    } finally {
      setEmojiReactingPostId(null);
    }
  }, []);

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
