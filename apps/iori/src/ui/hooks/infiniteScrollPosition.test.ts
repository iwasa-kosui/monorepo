import { afterEach, describe, expect, it, vi } from 'vitest';

import { decideLoadMore, isNearDocumentEnd, isNearScrollEnd } from './infiniteScrollPosition.ts';

describe('isNearScrollEnd', () => {
  it('returns false far from the end of the page', () => {
    expect(isNearScrollEnd(500, 800, 6000)).toBe(false);
  });

  it('returns true before reaching the end, within the prefetch distance', () => {
    expect(isNearScrollEnd(3600, 800, 6000)).toBe(true);
  });

  it('returns false just outside the prefetch distance', () => {
    expect(isNearScrollEnd(3599, 800, 6000)).toBe(false);
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

  it('uses the larger scroll height when the body is taller than the document element', () => {
    stubPage({ scrollY: 5200, innerHeight: 800 }, { documentElement: 800, body: 6000 });

    expect(isNearDocumentEnd()).toBe(true);
    stubPage({ scrollY: 500, innerHeight: 800 }, { documentElement: 800, body: 6000 });
    expect(isNearDocumentEnd()).toBe(false);
  });

  it('uses the larger scroll height when the document element is taller than the body', () => {
    stubPage({ scrollY: 500, innerHeight: 800 }, { documentElement: 6000, body: 100 });

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
