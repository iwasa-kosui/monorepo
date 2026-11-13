import { describe, expect, it, vi } from 'vitest';

import { createDefaultPostVisibilityCache } from './useDefaultPostVisibility.ts';

describe('createDefaultPostVisibilityCache', () => {
  it('2回続けて読み込んでも、取得は1回だけ行う', async () => {
    const fetchDefault = vi.fn(() => Promise.resolve('private' as const));
    const cache = createDefaultPostVisibilityCache(fetchDefault);

    const [first, second] = await Promise.all([cache.load(), cache.load()]);

    expect(first).toBe('private');
    expect(second).toBe('private');
    expect(fetchDefault).toHaveBeenCalledTimes(1);
  });

  it('取得に失敗したら、次の読み込みで取得し直す', async () => {
    const fetchDefault = vi.fn<() => Promise<'public' | 'unlisted'>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce('unlisted');
    const cache = createDefaultPostVisibilityCache(fetchDefault);

    await expect(cache.load()).rejects.toThrow('network');
    await expect(cache.load()).resolves.toBe('unlisted');
    expect(fetchDefault).toHaveBeenCalledTimes(2);
  });

  it('値を置き換えたら、取得せずに新しい値を返す', async () => {
    const fetchDefault = vi.fn(() => Promise.resolve('public' as const));
    const cache = createDefaultPostVisibilityCache(fetchDefault);
    await cache.load();

    cache.replace('private');

    await expect(cache.load()).resolves.toBe('private');
    expect(fetchDefault).toHaveBeenCalledTimes(1);
  });

  it('捨てたら、次の読み込みで取得し直す', async () => {
    const fetchDefault = vi.fn(() => Promise.resolve('public' as const));
    const cache = createDefaultPostVisibilityCache(fetchDefault);
    await cache.load();

    cache.clear();
    await cache.load();

    expect(fetchDefault).toHaveBeenCalledTimes(2);
  });
});
