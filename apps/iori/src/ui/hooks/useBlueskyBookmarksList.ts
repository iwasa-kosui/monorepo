import { useCallback, useEffect, useRef, useState } from 'hono/jsx';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { fetchBlueskyBookmarks } from '../api/blueskyBookmarkClient.ts';
import { isUnauthorizedError } from '../api/mastodonClient.ts';
import { appendUniqueBy } from './appendUnique.ts';
import { nextSearchCursor } from './blueskySearchPages.ts';
import { currentGeneration, type GenerationRef, isStaleGeneration, startGeneration } from './generation.ts';
import { canStartPageLoadMore } from './loadMoreGuard.ts';
import { useInfiniteScroll } from './useInfiniteScroll.ts';

type Item = IoriBlueskyTimelineItemBody;

export type BlueskyBookmarksListState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'error'; error: unknown }>
  | Readonly<{
    kind: 'ready';
    items: readonly Item[];
    cursor: string | undefined;
    isLoadingMore: boolean;
    loadMoreFailure: Readonly<{ error: unknown }> | undefined;
  }>;

export type UseBlueskyBookmarksListReturn = Readonly<{
  state: BlueskyBookmarksListState;
  reload: () => void;
  retryLoadMore: () => void;
  updateItems: (updater: (items: readonly Item[]) => readonly Item[]) => void;
}>;

const itemKey = (item: Item): string => item.feedItemId;

export const useBlueskyBookmarksList = (): UseBlueskyBookmarksListReturn => {
  const [state, setState] = useState<BlueskyBookmarksListState>({ kind: 'loading' });
  const [seq, setSeq] = useState(0);
  const generationRef: GenerationRef = useRef<number | null>(null);
  const isLoadingMoreRef = useRef(false);

  useEffect(() => {
    const generation = startGeneration(generationRef);
    isLoadingMoreRef.current = false;
    setState({ kind: 'loading' });
    fetchBlueskyBookmarks().then(
      (page) => {
        if (isStaleGeneration(generationRef, generation)) return;
        setState({
          kind: 'ready',
          items: page.items,
          cursor: nextSearchCursor(undefined, page.cursor, page.items.length),
          isLoadingMore: false,
          loadMoreFailure: undefined,
        });
      },
      (error: unknown) => {
        if (isStaleGeneration(generationRef, generation)) return;
        if (isUnauthorizedError(error)) {
          window.location.href = '/sign-in';
          return;
        }
        setState({ kind: 'error', error });
      },
    );
  }, [seq]);

  const isFirstPageSettled = state.kind === 'ready';

  const loadMore = useCallback(async (cursor: string) => {
    if (!canStartPageLoadMore(isLoadingMoreRef.current === true, isFirstPageSettled)) return;
    const generation = currentGeneration(generationRef);
    isLoadingMoreRef.current = true;
    setState((prev) => prev.kind === 'ready' ? { ...prev, isLoadingMore: true } : prev);
    try {
      const page = await fetchBlueskyBookmarks(cursor);
      if (isStaleGeneration(generationRef, generation)) return;
      setState((prev) =>
        prev.kind === 'ready'
          ? {
            kind: 'ready',
            items: appendUniqueBy(prev.items, page.items, itemKey),
            cursor: nextSearchCursor(cursor, page.cursor, page.items.length),
            isLoadingMore: false,
            loadMoreFailure: undefined,
          }
          : prev
      );
    } catch (error) {
      if (isStaleGeneration(generationRef, generation)) return;
      console.error('Failed to load more Bluesky bookmarks:', error);
      setState((prev) => prev.kind === 'ready' ? { ...prev, isLoadingMore: false, loadMoreFailure: { error } } : prev);
    } finally {
      if (!isStaleGeneration(generationRef, generation)) isLoadingMoreRef.current = false;
    }
  }, [isFirstPageSettled]);

  useInfiniteScroll({
    nextCursor: state.kind === 'ready' && state.loadMoreFailure === undefined ? state.cursor : undefined,
    onLoadMore: loadMore,
    isFirstPageSettled,
  });

  const reload = useCallback(() => setSeq((prev) => prev + 1), []);

  const retryLoadMore = useCallback(() => {
    if (state.kind === 'ready' && state.cursor !== undefined) void loadMore(state.cursor);
  }, [state, loadMore]);

  const updateItems = useCallback((updater: (items: readonly Item[]) => readonly Item[]) => {
    setState((prev) => {
      if (prev.kind !== 'ready') return prev;
      const items = updater(prev.items);
      return items === prev.items ? prev : { ...prev, items };
    });
  }, []);

  return { state, reload, retryLoadMore, updateItems };
};
