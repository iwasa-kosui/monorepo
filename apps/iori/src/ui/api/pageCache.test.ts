import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlueskyTimelinePage } from './mastodonClient.ts';
import { readBlueskyPageCache, writeBlueskyPageCache } from './pageCache.ts';
import { writeCache } from './responseCache.ts';

const URL = '/api/iori/v1/bluesky/timeline?scope=home';

describe('Bluesky のページのキャッシュ', () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    });
    vi.stubGlobal('document', { getElementById: () => ({ dataset: { userId: 'user-a' } }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('書いたページをそのまま読み出す', () => {
    const page: BlueskyTimelinePage = { enabled: true, items: [], nextBefore: 1000, nextBeforeId: 'a' };

    writeBlueskyPageCache(URL, page);

    expect(readBlueskyPageCache(URL)).toEqual(page);
  });

  it('キャッシュが無いときと、形の違う本文のときは undefined にする', () => {
    expect(readBlueskyPageCache(URL)).toBeUndefined();

    writeCache(URL, [{ id: '1' }]);

    expect(readBlueskyPageCache(URL)).toBeUndefined();
  });
});
