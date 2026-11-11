import { useCallback, useEffect, useRef } from 'hono/jsx';

import { decideLoadMore, isNearDocumentEnd } from './infiniteScrollPosition.ts';

type UseInfiniteScrollProps = Readonly<{
  nextCursor: string | undefined;
  onLoadMore: (cursor: string) => void;
  debounceMs?: number;
  isFirstPageSettled?: boolean;
}>;

export const useInfiniteScroll = ({
  nextCursor,
  onLoadMore,
  debounceMs = 100,
  isFirstPageSettled = true,
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
      const decision = decideLoadMore({
        isFirstPageSettled,
        cursor: nextCursor,
        isNearEnd: isFirstPageSettled && isNearDocumentEnd(),
        isAutomatic,
        lastAutoLoadedCursor: lastAutoLoadedCursorRef.current ?? undefined,
      });
      if (decision.kind === 'skip') return;
      if (decision.kind === 'debounced') {
        debouncedLoadMore(decision.cursor);
        return;
      }
      lastAutoLoadedCursorRef.current = decision.cursor;
      onLoadMore(decision.cursor);
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
  }, [nextCursor, onLoadMore, debouncedLoadMore, isFirstPageSettled]);
};
