import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CACHE_TTL_MS, clearAllCache, readCache, writeCache } from './responseCache.ts';

const createFakeStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
};

const stubUser = (userId: string | undefined) => {
  vi.stubGlobal('document', {
    getElementById: () => userId === undefined ? null : { dataset: { userId } },
  });
};

describe('responseCache', () => {
  let storage: ReturnType<typeof createFakeStorage>;

  beforeEach(() => {
    storage = createFakeStorage();
    vi.stubGlobal('sessionStorage', storage);
    stubUser('user-a');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips the body, the cursors and the saved time by URL', () => {
    writeCache('/api/v1/favourites', [{ id: '1' }], { nextMaxId: '9' }, 1_000);

    expect(readCache('/api/v1/favourites', 2_000)).toEqual({
      body: [{ id: '1' }],
      savedAt: 1_000,
      cursors: { nextMaxId: '9' },
    });
    expect(readCache('/api/v1/other', 2_000)).toBeUndefined();
  });

  it('returns nothing and removes the entry once it is 5 minutes old', () => {
    writeCache('/a', { ok: true }, undefined, 0);

    expect(readCache('/a', CACHE_TTL_MS - 1)?.body).toEqual({ ok: true });
    expect(readCache('/a', CACHE_TTL_MS)).toBeUndefined();
    expect(storage.map.size).toBe(0);
  });

  it('treats corrupt JSON and malformed entries as a miss', () => {
    storage.setItem('iori:response-cache:user-a:/broken', '{not json');
    storage.setItem('iori:response-cache:user-a:/shape', JSON.stringify({ body: 1 }));

    expect(readCache('/broken', 0)).toBeUndefined();
    expect(readCache('/shape', 0)).toBeUndefined();
  });

  it('does not let another account read what one account wrote', () => {
    writeCache('/api/v1/favourites', [{ id: 'a' }], undefined, 0);

    stubUser('user-b');
    expect(readCache('/api/v1/favourites', 1)).toBeUndefined();
    writeCache('/api/v1/favourites', [{ id: 'b' }], undefined, 0);
    expect(readCache('/api/v1/favourites', 1)?.body).toEqual([{ id: 'b' }]);

    stubUser('user-a');
    expect(readCache('/api/v1/favourites', 1)?.body).toEqual([{ id: 'a' }]);
  });

  it.each([['an empty user id', ''], ['no user id', undefined]])(
    'neither reads nor writes with %s',
    (_label, userId) => {
      writeCache('/a', 'secret', undefined, 0);
      expect(storage.map.size).toBe(1);

      stubUser(userId);
      expect(readCache('/a', 1)).toBeUndefined();
      writeCache('/b', 'x', undefined, 0);
      expect(storage.map.size).toBe(1);
    },
  );

  it('neither reads nor writes when there is no document', () => {
    writeCache('/a', 'secret', undefined, 0);

    vi.stubGlobal('document', undefined);
    expect(readCache('/a', 1)).toBeUndefined();
    writeCache('/b', 'x', undefined, 0);
    expect(storage.map.size).toBe(1);
  });

  it('does not throw when sessionStorage throws', () => {
    const failing = {
      get length(): number {
        throw new Error('denied');
      },
      key: () => {
        throw new Error('denied');
      },
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    vi.stubGlobal('sessionStorage', failing);

    expect(() => writeCache('/a', [], undefined, 0)).not.toThrow();
    expect(readCache('/a', 0)).toBeUndefined();
    expect(() => clearAllCache()).not.toThrow();
  });

  it('does not throw when sessionStorage does not exist', () => {
    vi.stubGlobal('sessionStorage', undefined);

    expect(() => writeCache('/a', [], undefined, 0)).not.toThrow();
    expect(readCache('/a', 0)).toBeUndefined();
    expect(() => clearAllCache()).not.toThrow();
  });

  it('removes every cache key and leaves unrelated keys alone', () => {
    writeCache('/a', 1, undefined, 0);
    writeCache('/b', 2, undefined, 0);
    stubUser('user-b');
    writeCache('/c', 3, undefined, 0);
    storage.setItem('unrelated', 'keep');

    clearAllCache();

    expect(storage.map.size).toBe(1);
    stubUser('user-a');
    expect(readCache('/a', 0)).toBeUndefined();
    expect(readCache('/b', 0)).toBeUndefined();
    expect(storage.getItem('unrelated')).toBe('keep');
  });
});
