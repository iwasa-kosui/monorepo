import { afterEach, describe, expect, it, vi } from 'vitest';

import { isNearDocumentEnd, isNearScrollEnd } from './infiniteScrollPosition.ts';

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

describe('isNearDocumentEnd', () => {
  const stubPage = (
    window: { scrollY: number; innerHeight: number },
    scrollHeights: { documentElement: number; body: number },
  ) => {
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', {
      documentElement: { scrollHeight: scrollHeights.documentElement },
      body: { scrollHeight: scrollHeights.body },
    });
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false in the middle of the page in standard mode', () => {
    stubPage({ scrollY: 500, innerHeight: 800 }, { documentElement: 3000, body: 3000 });

    expect(isNearDocumentEnd()).toBe(false);
  });

  it('returns true at the end of the page in standard mode', () => {
    stubPage({ scrollY: 2200, innerHeight: 800 }, { documentElement: 3000, body: 3000 });

    expect(isNearDocumentEnd()).toBe(true);
  });

  it('uses the larger scroll height when the body is taller than the document element', () => {
    stubPage({ scrollY: 2200, innerHeight: 800 }, { documentElement: 800, body: 3000 });

    expect(isNearDocumentEnd()).toBe(true);
    stubPage({ scrollY: 500, innerHeight: 800 }, { documentElement: 800, body: 3000 });
    expect(isNearDocumentEnd()).toBe(false);
  });

  it('uses the larger scroll height when the document element is taller than the body', () => {
    stubPage({ scrollY: 500, innerHeight: 800 }, { documentElement: 3000, body: 100 });

    expect(isNearDocumentEnd()).toBe(false);
  });
});
