import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  decideLoadMore,
  isNearDocumentEnd,
  isNearScrollEnd,
  shouldAutoLoadCursor,
  shouldLoadNow,
} from './infiniteScrollPosition.ts';

describe('shouldLoadNow', () => {
  it('loads when a cursor exists and the end of the page is near', () => {
    expect(shouldLoadNow('cursor-1', true)).toBe(true);
  });

  it('does not load when the end of the page is far', () => {
    expect(shouldLoadNow('cursor-1', false)).toBe(false);
  });

  it('does not load without a cursor even when the end of the page is near', () => {
    expect(shouldLoadNow(undefined, true)).toBe(false);
  });
});

describe('shouldAutoLoadCursor', () => {
  it('loads a cursor that was never loaded automatically', () => {
    expect(shouldAutoLoadCursor('cursor-1', undefined)).toBe(true);
  });

  it('does not load the same cursor twice, as when the load failed and the cursor did not change', () => {
    expect(shouldAutoLoadCursor('cursor-1', 'cursor-1')).toBe(false);
  });

  it('loads again once the cursor changes', () => {
    expect(shouldAutoLoadCursor('cursor-2', 'cursor-1')).toBe(true);
  });

  it('does not load without a cursor', () => {
    expect(shouldAutoLoadCursor(undefined, 'cursor-1')).toBe(false);
  });
});

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

describe('decideLoadMore', () => {
  const base = {
    isFirstPageSettled: true,
    cursor: 'cursor-1',
    isNearEnd: true,
    isAutomatic: true,
    lastAutoLoadedCursor: undefined,
  } as const;

  it('skips both the automatic and the scroll checks until the first page has settled', () => {
    expect(decideLoadMore({ ...base, isFirstPageSettled: false })).toEqual({ kind: 'skip' });
    expect(decideLoadMore({ ...base, isFirstPageSettled: false, isAutomatic: false })).toEqual({ kind: 'skip' });
  });

  it('loads automatically after the first page has settled when the end of the list is on screen', () => {
    expect(decideLoadMore(base)).toEqual({ kind: 'immediate', cursor: 'cursor-1' });
  });

  it('does not load automatically when the end of the list is off screen', () => {
    expect(decideLoadMore({ ...base, isNearEnd: false })).toEqual({ kind: 'skip' });
  });

  it('does not load automatically twice for the same cursor', () => {
    expect(decideLoadMore({ ...base, lastAutoLoadedCursor: 'cursor-1' })).toEqual({ kind: 'skip' });
  });

  it('debounces the scroll check once the first page has settled', () => {
    expect(decideLoadMore({ ...base, isAutomatic: false, lastAutoLoadedCursor: 'cursor-1' })).toEqual({
      kind: 'debounced',
      cursor: 'cursor-1',
    });
  });

  it('skips without a cursor', () => {
    expect(decideLoadMore({ ...base, cursor: undefined })).toEqual({ kind: 'skip' });
  });
});
