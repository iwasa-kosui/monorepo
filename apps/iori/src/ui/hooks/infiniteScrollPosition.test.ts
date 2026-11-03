import { describe, expect, it } from 'vitest';

import { isNearScrollEnd } from './infiniteScrollPosition.ts';

describe('isNearScrollEnd', () => {
  it('returns false in the middle of the page in standard mode', () => {
    expect(isNearScrollEnd(500, 800, 3000)).toBe(false);
  });

  it('returns false at the top of the page', () => {
    expect(isNearScrollEnd(0, 800, 3000)).toBe(false);
  });

  it('returns true at the end of the page', () => {
    expect(isNearScrollEnd(2200, 800, 3000)).toBe(true);
  });

  it('returns true within the threshold of the end', () => {
    expect(isNearScrollEnd(2191, 800, 3000)).toBe(true);
  });

  it('returns false just outside the threshold', () => {
    expect(isNearScrollEnd(2189, 800, 3000)).toBe(false);
  });

  it('returns true when the page is shorter than the viewport', () => {
    expect(isNearScrollEnd(0, 800, 600)).toBe(true);
  });
});
