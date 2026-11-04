import { describe, expect, it } from 'vitest';

import { canStartLoadMore } from './loadMoreGuard.ts';

describe('canStartLoadMore', () => {
  it('starts when idle and a cursor exists', () => {
    expect(canStartLoadMore(false, false, true)).toBe(true);
  });

  it('does not start while another load more is in flight', () => {
    expect(canStartLoadMore(true, false, true)).toBe(false);
  });

  it('does not start while a reload is waiting for its response', () => {
    expect(canStartLoadMore(false, true, true)).toBe(false);
  });

  it('does not start when there is no cursor', () => {
    expect(canStartLoadMore(false, false, false)).toBe(false);
  });

  it('does not start when load more and reload are both in flight', () => {
    expect(canStartLoadMore(true, true, true)).toBe(false);
  });
});
