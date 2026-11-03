import type { Instant } from '../../domain/instant/instant.ts';
import type { TimelineState } from './useTimeline.ts';

export const stateAfterFetchFailure = (
  prev: TimelineState,
  createdAt: Instant | undefined,
  error: string,
): TimelineState => {
  if (createdAt !== undefined && prev.status === 'success') {
    return prev;
  }
  return { status: 'error', error };
};
