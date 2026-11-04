import { useCallback, useEffect, useRef } from 'hono/jsx';

import { isNearDocumentEnd, shouldAutoLoadCursor, shouldLoadNow } from './infiniteScrollPosition.ts';

type UseInfiniteScrollProps = Readonly<{
  nextCursor: string | undefined;
  onLoadMore: (cursor: string) => void;
  debounceMs?: number;
}>;

export const useInfiniteScroll = ({
  nextCursor,
  onLoadMore,
  debounceMs = 300,
}: UseInfiniteScrollProps): void => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timeoutRef = useRef<any>(undefined);
  const lastAutoLoadedCursorRef = useRef<string | undefined>(undefined);

  const debouncedLoadMore = useCallback(
    (cursor: string) => {
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        onLoadMore(cursor);
      }, debounceMs);
    },
    [onLoadMore, debounceMs],
  );

  useEffect(() => {
    const check = (isAutomatic: boolean) => {
      if (!shouldLoadNow(nextCursor, isNearDocumentEnd())) return;
      if (!isAutomatic) {
        debouncedLoadMore(nextCursor);
        return;
      }
      if (!shouldAutoLoadCursor(nextCursor, lastAutoLoadedCursorRef.current ?? undefined)) return;
      lastAutoLoadedCursorRef.current = nextCursor;
      onLoadMore(nextCursor);
    };

    const handleScrollOrResize = () => check(false);

    const frameId = requestAnimationFrame(() => check(true));
    window.addEventListener('scroll', handleScrollOrResize);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', handleScrollOrResize);
      window.removeEventListener('resize', handleScrollOrResize);
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [nextCursor, onLoadMore, debouncedLoadMore]);
};
