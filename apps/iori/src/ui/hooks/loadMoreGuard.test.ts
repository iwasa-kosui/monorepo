import { describe, expect, it } from 'vitest';

import { canStartLoadMore, isCurrentCursor } from './loadMoreGuard.ts';

describe('canStartLoadMore', () => {
  it('starts when idle and the cursor is the current one', () => {
    expect(canStartLoadMore(false, false, true)).toBe(true);
  });

  it('does not start while another load more is in flight', () => {
    expect(canStartLoadMore(true, false, true)).toBe(false);
  });

  it('does not start while a reload is waiting for its response', () => {
    expect(canStartLoadMore(false, true, true)).toBe(false);
  });

  it('does not start with a stale cursor that differs from the current one', () => {
    expect(canStartLoadMore(false, false, false)).toBe(false);
  });

  it('does not start when load more and reload are both in flight', () => {
    expect(canStartLoadMore(true, true, true)).toBe(false);
  });
});

describe('isCurrentCursor', () => {
  it('is true when the max id equals the current cursor', () => {
    expect(isCurrentCursor('cursor-2', 'cursor-2')).toBe(true);
  });

  it('is false for a stale cursor from before a reload', () => {
    expect(isCurrentCursor('cursor-1', 'cursor-2')).toBe(false);
  });

  it('is false when the current cursor is undefined, as after the timeline is exhausted or failed', () => {
    expect(isCurrentCursor('cursor-1', undefined)).toBe(false);
  });

  it('is false for an empty max id', () => {
    expect(isCurrentCursor('', 'cursor-1')).toBe(false);
  });
});
