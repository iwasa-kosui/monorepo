import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { timedOut, withTimeout } from './withTimeout.ts';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('時間内に解決すればその値を返し、タイマーを残さない', async () => {
    const result = await withTimeout(Promise.resolve(42), 1000);

    expect(result).toBe(42);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('時間内に返らなければ timedOut を返し、タイマーを残さない', async () => {
    const pending = withTimeout(new Promise<number>(() => {}), 1000);

    await vi.advanceTimersByTimeAsync(999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toBe(timedOut);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('時間内の reject はそのまま伝え、タイマーを残さない', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('時間切れの後で元の Promise が reject しても未処理の拒否にしない', async () => {
    const late = Promise.withResolvers<number>();
    const pending = withTimeout(late.promise, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBe(timedOut);
    late.reject(new Error('late failure'));
    await vi.advanceTimersByTimeAsync(0);
  });
});
