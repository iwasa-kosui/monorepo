import { useCallback, useState } from 'react';

import type { Client } from '../../client.js';
import type { HomeTimelineResponse, TimelineItemData } from '../../types.js';

interface UseTimelineResult {
  items: TimelineItemData[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createPost: (content: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  toggleLike: (index: number) => Promise<void>;
  toggleRepost: (index: number) => Promise<void>;
}

export function useTimeline(client: Client): UseTimelineResult {
  const [items, setItems] = useState<TimelineItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.get<HomeTimelineResponse>('/api/v1/home');
      setItems(data.timelineItems);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  const createPost = useCallback(async (content: string) => {
    try {
      await client.postJson('/api/v1/posts', { content });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client, reload]);

  const deletePost = useCallback(async (postId: string) => {
    const prev = items;
    setItems((cur) => cur.filter((item) => item.post.postId !== postId));
    try {
      await client.del(`/api/v1/posts/${encodeURIComponent(postId)}`);
    } catch (e) {
      setItems(prev);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client, items]);

  const toggleLike = useCallback(async (index: number) => {
    const item = items[index];
    if (!item) return;
    const post = item.post;
    const wasLiked = post.liked;

    setItems((cur) =>
      cur.map((it, i) =>
        i === index
          ? {
            ...it,
            post: {
              ...it.post,
              liked: !wasLiked,
              likeCount: it.post.likeCount + (wasLiked ? -1 : 1),
            },
          }
          : it
      )
    );

    try {
      if (wasLiked) {
        await client.del('/api/v1/like', { postId: post.postId });
      } else {
        await client.postJson('/api/v1/like', { postId: post.postId });
      }
    } catch (e) {
      setItems((cur) =>
        cur.map((it, i) =>
          i === index
            ? {
              ...it,
              post: {
                ...it.post,
                liked: wasLiked,
                likeCount: it.post.likeCount + (wasLiked ? 1 : -1),
              },
            }
            : it
        )
      );
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client, items]);

  const toggleRepost = useCallback(async (index: number) => {
    const item = items[index];
    if (!item) return;
    const post = item.post;
    const wasReposted = post.reposted;

    setItems((cur) =>
      cur.map((it, i) =>
        i === index
          ? {
            ...it,
            post: {
              ...it.post,
              reposted: !wasReposted,
              repostCount: it.post.repostCount + (wasReposted ? -1 : 1),
            },
          }
          : it
      )
    );

    try {
      if (wasReposted) {
        await client.del('/api/v1/repost', { postId: post.postId });
      } else {
        await client.postJson('/api/v1/repost', { postId: post.postId });
      }
    } catch (e) {
      setItems((cur) =>
        cur.map((it, i) =>
          i === index
            ? {
              ...it,
              post: {
                ...it.post,
                reposted: wasReposted,
                repostCount: it.post.repostCount + (wasReposted ? 1 : -1),
              },
            }
            : it
        )
      );
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client, items]);

  return { items, loading, error, reload, createPost, deletePost, toggleLike, toggleRepost };
}
