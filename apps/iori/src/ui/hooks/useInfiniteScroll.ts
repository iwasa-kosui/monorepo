import { useCallback, useEffect, useRef } from 'hono/jsx';

import { isNearDocumentEnd } from './infiniteScrollPosition.ts';

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
    const handleScroll = () => {
      if (nextCursor === undefined) return;

      if (isNearDocumentEnd()) {
        debouncedLoadMore(nextCursor);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [nextCursor, debouncedLoadMore]);
};
