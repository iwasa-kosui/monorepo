export const canStartLoadMore = (
  isLoadingMore: boolean,
  isReloading: boolean,
  hasCursor: boolean,
): boolean => hasCursor && !isLoadingMore && !isReloading;
