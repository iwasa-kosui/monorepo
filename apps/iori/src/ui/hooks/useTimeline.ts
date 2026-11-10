import { useCallback, useEffect, useRef, useState } from 'hono/jsx';

import type { Account, CredentialAccount, Status } from '../../adaptor/mastodon/entities.ts';
import {
  fetchBlueskyHomeTimeline,
  fetchFollowers,
  fetchFollowing,
  fetchHomeTimeline,
  fetchVerifyCredentials,
  isMastodonApiError,
  isUnauthorizedError,
} from '../api/mastodonClient.ts';
import { clearAllCache } from '../api/responseCache.ts';
import { removeStatusesByPostId, updateStatusesByPostId } from '../api/status.ts';
import { currentGeneration, isStaleGeneration, startGeneration } from './generation.ts';
import {
  type BlueskyCursor,
  type BlueskySource,
  blueskySourceOf,
  homeFeedCursor,
  pagingAfterLoadMore,
  settleLoadMore,
} from './homeFeed.ts';
import { canStartLoadMore, isCurrentCursor } from './loadMoreGuard.ts';
import type { BlueskyItemsUpdater } from './optimisticBlueskyLike.ts';
import { prependUniqueById } from './prependUnique.ts';
import {
  initialTimelineState,
  readTimelineCache,
  stateAfterFirstPage,
  stateAfterFirstPageFailure,
  writeTimelineCache,
} from './timelineCache.ts';
import { stateAfterFetchFailure } from './timelineFailure.ts';

const ACCOUNT_LIST_LIMIT = 80;

export type TimelineData = Readonly<{
  me: CredentialAccount;
  statuses: readonly Status[];
  followers: readonly Account[];
  following: readonly Account[];
  nextMaxId: string | undefined;
  bluesky: BlueskySource;
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
  isFirstPageSettled: boolean;
  updateTimelineItem: StatusUpdater;
  updateBlueskyItems: BlueskyItemsUpdater;
  removePost: (postId: string) => void;
  prependPost: (status: Status) => void;
  updateMe: (me: CredentialAccount) => void;
}>;

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

export const useTimeline = (): UseTimelineReturn => {
  const [state, setState] = useState<TimelineState>(() => initialTimelineState(readTimelineCache()));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFirstPageSettled, setIsFirstPageSettled] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const isReloadingRef = useRef(state.status === 'success');
  const isShowingCacheRef = useRef(state.status === 'success');
  const nextMaxIdRef = useRef<string | undefined>(state.status === 'success' ? state.data.nextMaxId : undefined);
  const blueskyCursorRef = useRef<BlueskyCursor | undefined>(
    state.status === 'success' ? state.data.bluesky.cursor : undefined,
  );
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
        const [[homeResult, blueskyResult], me] = await Promise.all([
          Promise.allSettled([fetchHomeTimeline(), fetchBlueskyHomeTimeline()]),
          fetchVerifyCredentials(),
        ]);
        if (isStaleGeneration(generationRef, generation)) return;
        if (homeResult.status === 'rejected') throw homeResult.reason;
        const page = homeResult.value;
        const blueskyPage = blueskyResult.status === 'fulfilled' ? blueskyResult.value : undefined;
        const bluesky = blueskySourceOf(blueskyPage);
        isReloadingRef.current = false;
        isShowingCacheRef.current = false;
        nextMaxIdRef.current = page.nextMaxId;
        blueskyCursorRef.current = bluesky.cursor;
        writeTimelineCache(page, me, blueskyPage);
        setState((prev) => stateAfterFirstPage(prev, me, page.items, page.nextMaxId, bluesky));
        setIsRefreshing(false);
        setIsFirstPageSettled(true);
        await loadAccountLists(me.id, generation);
      } catch (error) {
        if (isStaleGeneration(generationRef, generation)) return;
        isReloadingRef.current = false;
        setIsRefreshing(false);
        setIsFirstPageSettled(true);
        const isUnauthorized = isUnauthorizedError(error);
        if (isUnauthorized) clearAllCache();
        if (!isManualRefresh) {
          const showingCache = isShowingCacheRef.current === true;
          if (!showingCache || isUnauthorized) {
            nextMaxIdRef.current = undefined;
            blueskyCursorRef.current = undefined;
            isShowingCacheRef.current = false;
          }
          setState((prev) => stateAfterFirstPageFailure(prev, showingCache, isUnauthorized, errorMessage(error)));
        } else if (isMastodonApiError(error)) {
          nextMaxIdRef.current = undefined;
          blueskyCursorRef.current = undefined;
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

  const loadMore = useCallback(async (cursor: string) => {
    if (
      !canStartLoadMore(
        isLoadingMoreRef.current === true,
        isReloadingRef.current === true,
        isCurrentCursor(
          cursor,
          homeFeedCursor(nextMaxIdRef.current ?? undefined, blueskyCursorRef.current ?? undefined),
        ),
      )
    ) return;
    isLoadingMoreRef.current = true;
    const generation = currentGeneration(generationRef);
    const maxId = nextMaxIdRef.current ?? undefined;
    const blueskyCursor = blueskyCursorRef.current ?? undefined;
    try {
      const [homeResult, blueskyResult] = await Promise.allSettled([
        maxId === undefined ? undefined : fetchHomeTimeline({ maxId }),
        blueskyCursor === undefined ? undefined : fetchBlueskyHomeTimeline(blueskyCursor),
      ]);
      if (isStaleGeneration(generationRef, generation)) return;
      const outcome = settleLoadMore({ maxId, blueskyCursor }, { home: homeResult, bluesky: blueskyResult });
      if (outcome.kind === 'homeFailed') {
        setState((prev) => stateAfterFetchFailure(prev, true, errorMessage(outcome.reason)));
        return;
      }
      const { advance } = outcome;
      nextMaxIdRef.current = advance.nextMaxId;
      blueskyCursorRef.current = advance.blueskyCursor;
      setState((prev) => {
        if (prev.status !== 'success') return prev;
        return { status: 'success', data: { ...prev.data, ...pagingAfterLoadMore(prev.data, advance) } };
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

  const updateBlueskyItems: BlueskyItemsUpdater = useCallback((updater) => {
    setState((prev) => {
      if (prev.status !== 'success') return prev;
      return {
        status: 'success',
        data: { ...prev.data, bluesky: { ...prev.data.bluesky, items: updater(prev.data.bluesky.items) } },
      };
    });
  }, []);

  const removePost = useCallback((postId: string) => {
    setState((prev) => {
      if (prev.status !== 'success') return prev;
      return {
        status: 'success',
        data: { ...prev.data, statuses: removeStatusesByPostId(prev.data.statuses, postId) },
      };
    });
  }, []);

  const prependPost = useCallback((status: Status) => {
    setState((prev) => {
      if (prev.status !== 'success') return prev;
      return {
        status: 'success',
        data: { ...prev.data, statuses: prependUniqueById(prev.data.statuses, status) },
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
    isFirstPageSettled,
    updateTimelineItem,
    updateBlueskyItems,
    removePost,
    prependPost,
    updateMe,
  } as const;
};
