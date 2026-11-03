import { describe, expect, it } from 'vitest';

import type { Instant } from '../../domain/instant/instant.ts';
import { stateAfterFetchFailure } from './timelineFailure.ts';
import type { TimelineData, TimelineState } from './useTimeline.ts';

const cursor = 1_700_000_000_000 as Instant;

const successState = (): TimelineState => ({
  status: 'success',
  data: {
    timelineItems: [{ timelineItemId: 'item-1' }, { timelineItemId: 'item-2' }],
  } as unknown as TimelineData,
});

describe('stateAfterFetchFailure', () => {
  it('keeps the success state and its timelineItems when loading more fails', () => {
    const prev = successState();

    const next = stateAfterFetchFailure(prev, cursor, 'HTTP 500');

    expect(next).toBe(prev);
    expect(next.status === 'success' && next.data.timelineItems).toHaveLength(2);
  });

  it('becomes error when the initial load fails', () => {
    const next = stateAfterFetchFailure({ status: 'loading' }, undefined, 'HTTP 500');

    expect(next).toEqual({ status: 'error', error: 'HTTP 500' });
  });

  it('becomes error when loading more fails while the previous state is loading', () => {
    const next = stateAfterFetchFailure({ status: 'loading' }, cursor, 'HTTP 500');

    expect(next).toEqual({ status: 'error', error: 'HTTP 500' });
  });
});
