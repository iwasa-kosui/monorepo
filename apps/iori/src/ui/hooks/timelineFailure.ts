import type { TimelineState } from './useTimeline.ts';

export const stateAfterFetchFailure = (
  prev: TimelineState,
  isLoadingMore: boolean,
  error: string,
): TimelineState => {
  if (isLoadingMore && prev.status === 'success') {
    return prev;
  }
  return { status: 'error', error };
};
