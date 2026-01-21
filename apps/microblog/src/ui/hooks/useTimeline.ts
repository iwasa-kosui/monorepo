import { hc } from 'hono/client';
import { useCallback, useEffect, useState } from 'hono/jsx';

import type { APIRouterType } from '../../adaptor/routes/apiRouter.tsx';
import type { Actor } from '../../domain/actor/actor.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { TimelineItemWithPost } from '../../domain/timeline/timelineItem.ts';
import type { User } from '../../domain/user/user.ts';

const client = hc<APIRouterType>('/api');

export type TimelineData = Readonly<{
  user: User;
  actor: Actor;
  timelineItems: readonly TimelineItemWithPost[];
  followers: readonly Actor[];
  following: readonly Actor[];
}>;

type TimelineState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: TimelineData };

type PostUpdater = (
  postId: string,
  updater: (item: TimelineItemWithPost) => TimelineItemWithPost,
) => void;

export type UseTimelineReturn = Readonly<{
  state: TimelineState;
  fetchMore: (createdAt: Instant | undefined) => Promise<void>;
  refresh: () => Promise<void>;
  isRefreshing: boolean;
  updateTimelineItem: PostUpdater;
  removePost: (postId: string) => void;
}>;

export const useTimeline = (): UseTimelineReturn => {
  const [state, setState] = useState<TimelineState>({ status: 'loading' });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchMore = useCallback(
    async (createdAt: Instant | undefined) => {
      const res = await client.v1.home.$get({
        query: { createdAt: createdAt ? String(createdAt) : undefined },
      });
      const latest = await res.json();

      if ('error' in latest) {
        setState({ status: 'error', error: latest.error });
        return;
      }

      setState((prev) => {
        if (prev.status === 'success' && createdAt !== undefined) {
          return {
            status: 'success',
            data: {
              ...latest,
              timelineItems: [...prev.data.timelineItems, ...latest.timelineItems],
            },
          };
        }
        return { status: 'success', data: latest };
      });
    },
    [],
  );

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await client.v1.home.$get({
        query: { createdAt: undefined },
      });
      const latest = await res.json();

      if ('error' in latest) {
        setState({ status: 'error', error: latest.error });
        return;
      }

      setState({ status: 'success', data: latest });
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const updateTimelineItem: PostUpdater = useCallback(
    (postId, updater) => {
      setState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          status: 'success',
          data: {
            ...prev.data,
            timelineItems: prev.data.timelineItems.map((item) => item.post.postId === postId ? updater(item) : item),
          },
        };
      });
    },
    [],
  );

  const removePost = useCallback((postId: string) => {
    setState((prev) => {
      if (prev.status !== 'success') return prev;
      return {
        status: 'success',
        data: {
          ...prev.data,
          timelineItems: prev.data.timelineItems.filter(
            (item) => item.post.postId !== postId,
          ),
        },
      };
    });
  }, []);

  useEffect(() => {
    fetchMore(undefined);
  }, [fetchMore]);

  return {
    state,
    fetchMore,
    refresh,
    isRefreshing,
    updateTimelineItem,
    removePost,
  } as const;
};
