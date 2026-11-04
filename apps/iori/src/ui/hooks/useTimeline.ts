import { useCallback, useEffect, useRef, useState } from 'hono/jsx';

import type { Account, CredentialAccount, Status } from '../../adaptor/mastodon/entities.ts';
import {
  fetchFollowers,
  fetchFollowing,
  fetchHomeTimeline,
  fetchVerifyCredentials,
  isMastodonApiError,
} from '../api/mastodonClient.ts';
import { removeStatusesByPostId, updateStatusesByPostId } from '../api/status.ts';
import { appendUniqueById } from './appendUnique.ts';
import { currentGeneration, isStaleGeneration, startGeneration } from './generation.ts';
import { canStartLoadMore, isCurrentCursor } from './loadMoreGuard.ts';
import { stateAfterFetchFailure } from './timelineFailure.ts';

const ACCOUNT_LIST_LIMIT = 80;

export type TimelineData = Readonly<{
  me: CredentialAccount;
  statuses: readonly Status[];
  followers: readonly Account[];
  following: readonly Account[];
  nextMaxId: string | undefined;
}>;

export type TimelineState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: TimelineData };

type StatusUpdater = (
  postId: string,
  updater: (status: Status) => Status,
) => void;

export type UseTimelineReturn = Readonly<{
  state: TimelineState;
  loadMore: (maxId: string) => Promise<void>;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  isRefreshing: boolean;
  updateTimelineItem: StatusUpdater;
  removePost: (postId: string) => void;
  updateMe: (me: CredentialAccount) => void;
}>;

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

export const useTimeline = (): UseTimelineReturn => {
  const [state, setState] = useState<TimelineState>({ status: 'loading' });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const isReloadingRef = useRef(false);
  const nextMaxIdRef = useRef<string | undefined>(undefined);
  const generationRef = useRef(0);

  const loadAccountLists = useCallback(async (accountId: string, generation: number) => {
    try {
      const [followers, following] = await Promise.all([
        fetchFollowers(accountId, { limit: ACCOUNT_LIST_LIMIT }),
        fetchFollowing(accountId, { limit: ACCOUNT_LIST_LIMIT }),
      ]);
      if (isStaleGeneration(generationRef, generation)) return;
      setState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          status: 'success',
          data: { ...prev.data, followers: followers.items, following: following.items },
        };
      });
    } catch (error) {
      console.error('Failed to load followers and following:', error);
    }
  }, []);

  const loadFirstPage = useCallback(
    async (isManualRefresh: boolean) => {
      const generation = startGeneration(generationRef);
      isLoadingMoreRef.current = false;
      isReloadingRef.current = true;
      if (isManualRefresh) setIsRefreshing(true);
      try {
        const [page, me] = await Promise.all([fetchHomeTimeline(), fetchVerifyCredentials()]);
        if (isStaleGeneration(generationRef, generation)) return;
        isReloadingRef.current = false;
        nextMaxIdRef.current = page.nextMaxId;
        setState((prev) => ({
          status: 'success',
          data: {
            me,
            statuses: page.items,
            nextMaxId: page.nextMaxId,
            followers: prev.status === 'success' ? prev.data.followers : [],
            following: prev.status === 'success' ? prev.data.following : [],
          },
        }));
        setIsRefreshing(false);
        await loadAccountLists(me.id, generation);
      } catch (error) {
        if (isStaleGeneration(generationRef, generation)) return;
        isReloadingRef.current = false;
        setIsRefreshing(false);
        if (!isManualRefresh) {
          nextMaxIdRef.current = undefined;
          setState((prev) => stateAfterFetchFailure(prev, false, errorMessage(error)));
        } else if (isMastodonApiError(error)) {
          nextMaxIdRef.current = undefined;
          setState({ status: 'error', error: error.message });
        } else {
          console.error('Failed to refresh:', error);
        }
      }
    },
    [loadAccountLists],
  );

  const reload = useCallback(() => loadFirstPage(false), [loadFirstPage]);

  const refresh = useCallback(() => loadFirstPage(true), [loadFirstPage]);

  const loadMore = useCallback(async (maxId: string) => {
    if (
      !canStartLoadMore(
        isLoadingMoreRef.current === true,
        isReloadingRef.current === true,
        isCurrentCursor(maxId, nextMaxIdRef.current ?? undefined),
      )
    ) return;
    isLoadingMoreRef.current = true;
    const generation = currentGeneration(generationRef);
    try {
      const page = await fetchHomeTimeline({ maxId });
      if (isStaleGeneration(generationRef, generation)) return;
      const nextMaxId = page.items.length === 0 || page.nextMaxId === maxId ? undefined : page.nextMaxId;
      nextMaxIdRef.current = nextMaxId;
      setState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          status: 'success',
          data: {
            ...prev.data,
            statuses: appendUniqueById(prev.data.statuses, page.items),
            nextMaxId,
          },
        };
      });
    } catch (error) {
      if (isStaleGeneration(generationRef, generation)) return;
      setState((prev) => stateAfterFetchFailure(prev, true, errorMessage(error)));
    } finally {
      if (!isStaleGeneration(generationRef, generation)) {
        isLoadingMoreRef.current = false;
      }
    }
  }, []);

  const updateTimelineItem: StatusUpdater = useCallback(
    (postId, updater) => {
      setState((prev) => {
        if (prev.status !== 'success') return prev;
        return {
          status: 'success',
          data: { ...prev.data, statuses: updateStatusesByPostId(prev.data.statuses, postId, updater) },
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
        data: { ...prev.data, statuses: removeStatusesByPostId(prev.data.statuses, postId) },
      };
    });
  }, []);

  const updateMe = useCallback((me: CredentialAccount) => {
    setState((prev) => prev.status === 'success' ? { status: 'success', data: { ...prev.data, me } } : prev);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    state,
    loadMore,
    reload,
    refresh,
    isRefreshing,
    updateTimelineItem,
    removePost,
    updateMe,
  } as const;
};
