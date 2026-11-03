import { describe, expect, it } from 'vitest';

import { stateAfterFetchFailure } from './timelineFailure.ts';
import type { TimelineData, TimelineState } from './useTimeline.ts';

const successState = (): TimelineState => ({
  status: 'success',
  data: {
    statuses: [{ id: 'status-1' }, { id: 'status-2' }],
  } as unknown as TimelineData,
});

describe('stateAfterFetchFailure', () => {
  it('keeps the success state and its statuses when loading more fails', () => {
    const prev = successState();

    const next = stateAfterFetchFailure(prev, true, 'HTTP 500');

    expect(next).toBe(prev);
    expect(next.status === 'success' && next.data.statuses).toHaveLength(2);
  });

  it('becomes error when the initial load fails', () => {
    const next = stateAfterFetchFailure({ status: 'loading' }, false, 'HTTP 500');

    expect(next).toEqual({ status: 'error', error: 'HTTP 500' });
  });

  it('becomes error when reloading fails even if the previous state is success', () => {
    const next = stateAfterFetchFailure(successState(), false, 'HTTP 401');

    expect(next).toEqual({ status: 'error', error: 'HTTP 401' });
  });

  it('becomes error when loading more fails while the previous state is loading', () => {
    const next = stateAfterFetchFailure({ status: 'loading' }, true, 'HTTP 500');

    expect(next).toEqual({ status: 'error', error: 'HTTP 500' });
  });
});
