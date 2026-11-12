import { useCallback, useEffect, useRef, useState } from 'hono/jsx';

import { isUnauthorizedError } from '../api/mastodonClient.ts';
import { isStaleGeneration, startGeneration } from './generation.ts';
import { appendPageTo, firstPageOf, type PagedListPage, type PagedListState } from './pagedListState.ts';
import { useInfiniteScroll } from './useInfiniteScroll.ts';

type Props<T> = Readonly<{
  load: (cursor?: string) => Promise<PagedListPage<T>>;
  keyOf: (item: T) => string;
  failureMessage: (error: unknown, kind: 'first' | 'more') => string;
}>;

export const usePagedList = <T>({ load, keyOf, failureMessage }: Props<T>) => {
  const [state, setState] = useState<PagedListState<T>>({ kind: 'loading' });
  const generationRef = useRef<number | null>(null);
  const isFetchingMoreRef = useRef(false);

  const loadFirstPage = useCallback(async () => {
    const generation = startGeneration(generationRef);
    isFetchingMoreRef.current = false;
    setState({ kind: 'loading' });
    try {
      const page = await load();
      if (isStaleGeneration(generationRef, generation)) return;
      setState(firstPageOf(page));
    } catch (error) {
      if (isStaleGeneration(generationRef, generation)) return;
      if (isUnauthorizedError(error)) {
        window.location.href = '/sign-in';
        return;
      }
      console.error('Failed to load the list:', error);
      setState({ kind: 'error', message: failureMessage(error, 'first') });
    }
  }, [load, failureMessage]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async (cursor: string) => {
    if (isFetchingMoreRef.current) return;
    isFetchingMoreRef.current = true;
    const generation = generationRef.current ?? 0;
    try {
      const page = await load(cursor);
      if (isStaleGeneration(generationRef, generation)) return;
      setState((prev) => prev.kind === 'ready' ? appendPageTo(prev, page, cursor, keyOf) : prev);
    } catch (error) {
      if (isStaleGeneration(generationRef, generation)) return;
      console.error('Failed to load more of the list:', error);
      const message = failureMessage(error, 'more');
      setState((prev) => prev.kind === 'ready' ? { ...prev, loadMoreFailed: message } : prev);
    } finally {
      isFetchingMoreRef.current = false;
    }
  }, [load, keyOf, failureMessage]);

  useInfiniteScroll({
    nextCursor: state.kind === 'ready' && state.loadMoreFailed === null ? state.cursor : undefined,
    onLoadMore: loadMore,
    isFirstPageSettled: state.kind !== 'loading',
  });

  return { state, loadFirstPage, loadMore };
};
