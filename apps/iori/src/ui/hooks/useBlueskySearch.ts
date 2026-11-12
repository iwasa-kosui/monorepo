import { useCallback, useEffect, useRef, useState } from 'hono/jsx';

import { isUnauthorizedError } from '../api/mastodonClient.ts';
import { appendUniqueBy } from './appendUnique.ts';
import { autoLoadCursor, type BlueskySearchFailure, nextSearchCursor, toSearchFailure } from './blueskySearchPages.ts';
import { currentGeneration, type GenerationRef, isStaleGeneration, startGeneration } from './generation.ts';
import { canStartPageLoadMore } from './loadMoreGuard.ts';
import { useInfiniteScroll } from './useInfiniteScroll.ts';

export type BlueskySearchPage<T> = Readonly<{ items: readonly T[]; cursor: string | null }>;

export type BlueskySearchState<T> =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'error'; status: number | undefined; code: string | undefined }>
  | Readonly<{
    kind: 'ready';
    items: readonly T[];
    cursor: string | undefined;
    isLoadingMore: boolean;
    loadMoreFailure: BlueskySearchFailure | undefined;
  }>;

export type BlueskySearchView<T> = Readonly<{ state: BlueskySearchState<T>; retryLoadMore: () => void }>;

type Props<T> = Readonly<{
  query: string;
  seq: number;
  fetchPage: (q: string, cursor: string | undefined) => Promise<BlueskySearchPage<T>>;
  keyOf: (item: T) => string;
}>;

export const useBlueskySearch = <T>({ query, seq, fetchPage, keyOf }: Props<T>): BlueskySearchView<T> => {
  const [state, setState] = useState<BlueskySearchState<T>>({ kind: 'idle' });
  const generationRef: GenerationRef = useRef<number | null>(null);
  const isLoadingMoreRef = useRef(false);

  useEffect(() => {
    const generation = startGeneration(generationRef);
    isLoadingMoreRef.current = false;
    if (query === '') {
      setState({ kind: 'idle' });
      return;
    }
    setState({ kind: 'loading' });
    fetchPage(query, undefined).then(
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
        setState({ kind: 'error', ...toSearchFailure(error) });
      },
    );
  }, [query, seq, fetchPage]);

  const isFirstPageSettled = state.kind === 'ready';

  const loadMore = useCallback(async (cursor: string) => {
    if (!canStartPageLoadMore(isLoadingMoreRef.current === true, isFirstPageSettled)) return;
    const generation = currentGeneration(generationRef);
    isLoadingMoreRef.current = true;
    setState((prev) => prev.kind === 'ready' ? { ...prev, isLoadingMore: true } : prev);
    try {
      const page = await fetchPage(query, cursor);
      if (isStaleGeneration(generationRef, generation)) return;
      setState((prev) =>
        prev.kind === 'ready'
          ? {
            kind: 'ready',
            items: appendUniqueBy(prev.items, page.items, keyOf),
            cursor: nextSearchCursor(cursor, page.cursor, page.items.length),
            isLoadingMore: false,
            loadMoreFailure: undefined,
          }
          : prev
      );
    } catch (error) {
      if (isStaleGeneration(generationRef, generation)) return;
      console.error('Failed to load more Bluesky search results:', error);
      setState((prev) =>
        prev.kind === 'ready' ? { ...prev, isLoadingMore: false, loadMoreFailure: toSearchFailure(error) } : prev
      );
    } finally {
      if (!isStaleGeneration(generationRef, generation)) isLoadingMoreRef.current = false;
    }
  }, [query, fetchPage, keyOf, isFirstPageSettled]);

  useInfiniteScroll({
    nextCursor: state.kind === 'ready' ? autoLoadCursor(state.cursor, state.loadMoreFailure) : undefined,
    onLoadMore: loadMore,
    isFirstPageSettled,
  });

  const retryLoadMore = useCallback(() => {
    if (state.kind === 'ready' && state.cursor !== undefined) void loadMore(state.cursor);
  }, [state, loadMore]);

  return { state, retryLoadMore };
};
