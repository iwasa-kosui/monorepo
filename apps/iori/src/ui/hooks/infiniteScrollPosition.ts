const NEAR_END_THRESHOLD_PX = 10;

export const isNearScrollEnd = (
  scrollY: number,
  innerHeight: number,
  scrollHeight: number,
): boolean => scrollY + innerHeight >= scrollHeight - NEAR_END_THRESHOLD_PX;

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
