const MIN_PREFETCH_DISTANCE_PX = 1200;
const PREFETCH_VIEWPORTS = 2;

/**
 * 末尾に到達する前に次のページを取りに行くための距離。
 * 画面2枚分（最低 1200px）手前で取得を始め、スクロールが止まらないようにする。
 */
export const prefetchDistance = (innerHeight: number): number =>
  Math.max(MIN_PREFETCH_DISTANCE_PX, innerHeight * PREFETCH_VIEWPORTS);

export const isNearScrollEnd = (
  scrollY: number,
  innerHeight: number,
  scrollHeight: number,
): boolean => scrollY + innerHeight >= scrollHeight - prefetchDistance(innerHeight);

export const shouldLoadNow = (
  cursor: string | undefined,
  isNearEnd: boolean,
): cursor is string => cursor !== undefined && isNearEnd;

export const shouldAutoLoadCursor = (
  cursor: string | undefined,
  lastAutoLoadedCursor: string | undefined,
): boolean => cursor !== undefined && cursor !== lastAutoLoadedCursor;

export type LoadMoreDecision =
  | Readonly<{ kind: 'skip' }>
  | Readonly<{ kind: 'debounced'; cursor: string }>
  | Readonly<{ kind: 'immediate'; cursor: string }>;

export const decideLoadMore = (
  input: Readonly<{
    isFirstPageSettled: boolean;
    cursor: string | undefined;
    isNearEnd: boolean;
    isAutomatic: boolean;
    lastAutoLoadedCursor: string | undefined;
  }>,
): LoadMoreDecision => {
  const { isFirstPageSettled, cursor, isNearEnd, isAutomatic, lastAutoLoadedCursor } = input;
  if (!isFirstPageSettled || !shouldLoadNow(cursor, isNearEnd)) return { kind: 'skip' };
  if (!isAutomatic) return { kind: 'debounced', cursor };
  return shouldAutoLoadCursor(cursor, lastAutoLoadedCursor) ? { kind: 'immediate', cursor } : { kind: 'skip' };
};

export const isNearDocumentEnd = (): boolean =>
  isNearScrollEnd(
    window.scrollY,
    window.innerHeight,
    Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
  );
