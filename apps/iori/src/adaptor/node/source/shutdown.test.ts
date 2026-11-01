import { afterEach, describe, expect, it, vi } from 'vitest';

import { createShutdown, SHUTDOWN_DEADLINE_MS } from './shutdown.ts';

afterEach(() => {
  vi.useRealTimers();
});
const settled = (status: 'fulfilled' | 'rejected'): PromiseSettledResult<unknown> =>
  status === 'fulfilled' ? { status, value: undefined } : { status, reason: new Error('x') };

describe('shutdown deadline', () => {
  it('exits with 0 without forcing when every task settles in time', async () => {
    const forceClose = vi.fn();
    const exit = vi.fn();
    await createShutdown({ run: async () => [settled('fulfilled')], forceClose, exit })();
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(forceClose).not.toHaveBeenCalled();
  });
  it('exits with 1 without forcing when a task rejects in time', async () => {
    const forceClose = vi.fn();
    const exit = vi.fn();
    await createShutdown({ run: async () => [settled('fulfilled'), settled('rejected')], forceClose, exit })();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(forceClose).not.toHaveBeenCalled();
  });
  it('removes the socket and exits with 1 when the tasks outlast the deadline', async () => {
    vi.useFakeTimers();
    const forceClose = vi.fn();
    const exit = vi.fn();
    const shutdown = createShutdown({ run: () => new Promise(() => {}), forceClose, exit });
    const pending = shutdown();
    await vi.advanceTimersByTimeAsync(SHUTDOWN_DEADLINE_MS - 1);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(forceClose).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('takes the forced path on a second signal while the first is still running', async () => {
    const forceClose = vi.fn();
    const exit = vi.fn();
    const run = vi.fn(() => new Promise<never>(() => {}));
    const shutdown = createShutdown({ run, forceClose, exit });
    void shutdown();
    await shutdown();
    expect(run).toHaveBeenCalledOnce();
    expect(forceClose).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('still exits with 1 when the forced removal throws', async () => {
    const exit = vi.fn();
    const shutdown = createShutdown({
      run: () => new Promise(() => {}),
      forceClose: () => {
        throw new Error('x');
      },
      exit,
    });
    void shutdown();
    await expect(shutdown()).rejects.toThrow('x');
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
