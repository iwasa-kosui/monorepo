export const canStartLoadMore = (
  isLoadingMore: boolean,
  isReloading: boolean,
  isCurrentCursor: boolean,
): boolean => isCurrentCursor && !isLoadingMore && !isReloading;

export const isCurrentCursor = (
  maxId: string,
  currentCursor: string | undefined,
): boolean => maxId.length > 0 && maxId === currentCursor;

export const canStartPageLoadMore = (
  isLoadingMore: boolean,
  isFirstPageSettled: boolean,
): boolean => isFirstPageSettled && !isLoadingMore;
