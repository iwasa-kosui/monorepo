import { useCallback, useEffect, useRef, useState } from 'hono/jsx';

import { isMastodonApiError, isUnauthorizedError } from '../api/mastodonClient.ts';
import { appendUniqueBy } from './appendUnique.ts';
import { nextSearchCursor } from './blueskySearchPages.ts';
import { currentGeneration, type GenerationRef, isStaleGeneration, startGeneration } from './generation.ts';
import { canStartPageLoadMore } from './loadMoreGuard.ts';
import { useInfiniteScroll } from './useInfiniteScroll.ts';

export type BlueskySearchPage<T> = Readonly<{ items: readonly T[]; cursor: string | null }>;

export type BlueskySearchState<T> =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'error'; status: number | undefined }>
  | Readonly<{ kind: 'ready'; items: readonly T[]; cursor: string | undefined }>;

type Props<T> = Readonly<{
  query: string;
  seq: number;
  fetchPage: (q: string, cursor: string | undefined) => Promise<BlueskySearchPage<T>>;
  keyOf: (item: T) => string;
}>;

export const useBlueskySearch = <T>({ query, seq, fetchPage, keyOf }: Props<T>): BlueskySearchState<T> => {
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
        });
      },
      (error: unknown) => {
        if (isStaleGeneration(generationRef, generation)) return;
        if (isUnauthorizedError(error)) {
          window.location.href = '/sign-in';
          return;
        }
        setState({ kind: 'error', status: isMastodonApiError(error) ? error.status : undefined });
      },
    );
  }, [query, seq, fetchPage]);

  const isFirstPageSettled = state.kind === 'ready';

  const loadMore = useCallback(async (cursor: string) => {
    if (!canStartPageLoadMore(isLoadingMoreRef.current === true, isFirstPageSettled)) return;
    const generation = currentGeneration(generationRef);
    isLoadingMoreRef.current = true;
    try {
      const page = await fetchPage(query, cursor);
      if (isStaleGeneration(generationRef, generation)) return;
      setState((prev) =>
        prev.kind === 'ready'
          ? {
            kind: 'ready',
            items: appendUniqueBy(prev.items, page.items, keyOf),
            cursor: nextSearchCursor(cursor, page.cursor, page.items.length),
          }
          : prev
      );
    } catch (error) {
      console.error('Failed to load more Bluesky search results:', error);
    } finally {
      if (!isStaleGeneration(generationRef, generation)) isLoadingMoreRef.current = false;
    }
  }, [query, fetchPage, keyOf, isFirstPageSettled]);

  useInfiniteScroll({
    nextCursor: state.kind === 'ready' ? state.cursor : undefined,
    onLoadMore: loadMore,
    isFirstPageSettled,
  });

  return state;
};
