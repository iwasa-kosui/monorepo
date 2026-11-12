export const shouldReloadStatuses = (remote: Readonly<{ fetched: number }>, hasLoadedMore: boolean): boolean =>
  remote.fetched > 0 && !hasLoadedMore;
