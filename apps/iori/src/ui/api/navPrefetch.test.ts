import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bookmarksUrl,
  favouritesUrl,
  homeTimelineUrl,
  NOTIFICATION_TYPES,
  notificationsUrl,
} from './mastodonClient.ts';
import { createPrefetcher, PREFETCH_FRESH_MS, type PrefetchDeps, readSaveData } from './navPrefetch.ts';
import { prefetchUrlsFor } from './prefetchTargets.ts';
import { readCache, writeCache } from './responseCache.ts';

const createFakeStorage = () => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
};

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

describe('prefetchUrlsFor', () => {
  it('maps the four screens to the GET APIs they call first', () => {
    expect(prefetchUrlsFor('/')).toEqual([
      '/api/v1/timelines/home?limit=40',
      '/api/v1/accounts/verify_credentials',
      '/api/iori/v1/bluesky/timeline?scope=home',
    ]);
    expect(prefetchUrlsFor('/likes')).toEqual(['/api/v1/favourites']);
    expect(prefetchUrlsFor('/bookmarks')).toEqual(['/api/v1/bookmarks']);
    expect(prefetchUrlsFor('/notifications')).toEqual([
      notificationsUrl(NOTIFICATION_TYPES),
      '/api/v1/accounts/verify_credentials',
    ]);
    expect(prefetchUrlsFor('/articles')).toEqual(['/api/iori/v1/articles']);
  });

  it('uses the same URL builders as the screens', () => {
    expect(prefetchUrlsFor('/')[0]).toBe(homeTimelineUrl());
    expect(prefetchUrlsFor('/likes')[0]).toBe(favouritesUrl());
    expect(prefetchUrlsFor('/bookmarks')[0]).toBe(bookmarksUrl());
    expect(notificationsUrl(NOTIFICATION_TYPES)).toBe(
      '/api/v1/notifications?types%5B%5D=favourite&types%5B%5D=mention&types%5B%5D=status&types%5B%5D=follow&types%5B%5D=reblog&types%5B%5D=iori%3Aemoji_reaction',
    );
  });

  it.each(['/auth/sign-in', '/auth/sign-up', '/sign-in', '/x', '/articles/abc', '/users/kosui', '/api/v1/markers'])(
    'returns nothing for %s',
    (pathname) => {
      expect(prefetchUrlsFor(pathname)).toEqual([]);
    },
  );
});

describe('createPrefetcher', () => {
  let now = 1_000_000;
  const fetchMock = vi.fn<typeof fetch>();

  const make = (overrides: Partial<PrefetchDeps> = {}) =>
    createPrefetcher({ fetch: fetchMock, now: () => now, saveData: false, isLoggedIn: true, ...overrides });

  beforeEach(() => {
    now = 1_000_000;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      jsonResponse([{ id: '1' }], { headers: { Link: '<http://x/?max_id=7>; rel="next"' } })
    );
    vi.stubGlobal('sessionStorage', createFakeStorage());
    vi.stubGlobal('document', { getElementById: () => ({ dataset: { userId: 'user-a' } }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches with GET and stores the body and the next cursor', async () => {
    await make().prefetch('/likes');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/favourites', expect.objectContaining({ method: 'GET' }));
    expect(readCache('/api/v1/favourites', now)).toEqual({
      body: [{ id: '1' }],
      savedAt: now,
      cursors: { nextMaxId: '7' },
    });
  });

  it('never calls anything but GET, and never markers or push', async () => {
    const prefetcher = make();
    for (const pathname of ['/', '/likes', '/notifications', '/articles', '/auth/sign-in', '/x']) {
      await prefetcher.prefetch(pathname);
    }

    for (const [url, init] of fetchMock.mock.calls) {
      expect(init?.method).toBe('GET');
      expect(String(url)).not.toMatch(/markers|push|\/auth\//);
    }
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/timelines/home?limit=40',
      '/api/v1/accounts/verify_credentials',
      '/api/iori/v1/bluesky/timeline?scope=home',
      '/api/v1/favourites',
      notificationsUrl(NOTIFICATION_TYPES),
      '/api/iori/v1/articles',
    ]);
  });

  it('does nothing for paths outside the table', async () => {
    await make().prefetch('/auth/sign-in');
    await make().prefetch('/users/kosui');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch the same URL again while a request is in flight', async () => {
    const prefetcher = make();

    await Promise.all([prefetcher.prefetch('/likes'), prefetcher.prefetch('/likes')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips a URL whose cache is newer than 30 seconds and refetches after that', async () => {
    writeCache('/api/v1/favourites', [], undefined, now - (PREFETCH_FRESH_MS - 1));
    await make().prefetch('/likes');
    expect(fetchMock).not.toHaveBeenCalled();

    now += 2;
    await make().prefetch('/likes');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing when saveData is on', async () => {
    await make({ saveData: true }).prefetch('/likes');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when the page is not logged in', async () => {
    await make({ isLoggedIn: false }).prefetch('/likes');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not store a 401 response and clears the existing cache', async () => {
    writeCache('/api/v1/accounts/verify_credentials', { id: 'old' }, undefined, now - PREFETCH_FRESH_MS * 2);
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'Unauthorized' }, { status: 401 }));

    await make().prefetch('/likes');

    expect(readCache('/api/v1/favourites', now)).toBeUndefined();
    expect(readCache('/api/v1/accounts/verify_credentials', now)).toBeUndefined();
  });

  it('does not store other failures and swallows network errors', async () => {
    fetchMock.mockImplementationOnce(async () => jsonResponse({ error: 'boom' }, { status: 500 }));
    await make().prefetch('/likes');
    expect(readCache('/api/v1/favourites', now)).toBeUndefined();

    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError('offline');
    });
    await expect(make().prefetch('/likes')).resolves.toBeUndefined();
  });

  it('does not retry within 30 seconds after a 500, and retries after that', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'boom' }, { status: 500 }));
    const prefetcher = make();

    await prefetcher.prefetch('/likes');
    now += PREFETCH_FRESH_MS - 1;
    await prefetcher.prefetch('/likes');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 1;
    await prefetcher.prefetch('/likes');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry within 30 seconds after a network error', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('offline');
    });
    const prefetcher = make();

    await prefetcher.prefetch('/likes');
    await prefetcher.prefetch('/likes');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry within 30 seconds after the cache write fails', async () => {
    vi.stubGlobal('sessionStorage', {
      ...createFakeStorage(),
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    });
    const prefetcher = make();

    await prefetcher.prefetch('/likes');
    await prefetcher.prefetch('/likes');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('readSaveData', () => {
  it('is true only when navigator.connection.saveData is true', () => {
    expect(readSaveData({ connection: { saveData: true } } as unknown as Navigator)).toBe(true);
    expect(readSaveData({ connection: { saveData: false } } as unknown as Navigator)).toBe(false);
    expect(readSaveData({} as unknown as Navigator)).toBe(false);
  });
});
