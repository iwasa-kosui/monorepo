import { useCallback, useEffect, useRef } from 'hono/jsx';

import type { Instant } from '../../domain/instant/instant.ts';

type UseInfiniteScrollProps = Readonly<{
  items: readonly { createdAt: Instant }[];
  onLoadMore: (cursor: Instant) => void;
  debounceMs?: number;
}>;

export const useInfiniteScroll = ({
  items,
  onLoadMore,
  debounceMs = 300,
}: UseInfiniteScrollProps): void => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timeoutRef = useRef<any>(undefined);

  const debouncedLoadMore = useCallback(
    (cursor: Instant) => {
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
      if (items.length === 0) return;

      const scrollHeight = document.body.scrollHeight;
      const scrollTop = document.body.scrollTop;
      const clientHeight = document.body.clientHeight;

      if (scrollTop + clientHeight >= scrollHeight - 10) {
        const oldest = items.reduce((prev, curr) => new Date(prev.createdAt) < new Date(curr.createdAt) ? prev : curr);
        debouncedLoadMore(oldest.createdAt);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [items, debouncedLoadMore]);
};
