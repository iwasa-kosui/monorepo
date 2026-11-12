import { describe, expect, it, vi } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { updateStatusesByPostId } from '../api/status.ts';
import { runOptimisticBookmark, withRestoredBookmark } from './optimisticBookmark.ts';
import { runExclusive } from './optimisticFavourite.ts';

const status = (id: string, overrides: Partial<Status> = {}): Status =>
  ({
    id,
    reblog: null,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    ...overrides,
  }) as Status;

const createList = (initial: readonly Status[]) => {
  let current = initial;
  return {
    get: () => current,
    update: (postId: string, updater: (status: Status) => Status) => {
      current = updateStatusesByPostId(current, postId, updater);
    },
  };
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('withRestoredBookmark', () => {
  it('restores bookmarked from the status shown before, on a plain status', () => {
    const restored = withRestoredBookmark(status('p1', { bookmarked: true }), status('p1', { bookmarked: false }));

    expect(restored.bookmarked).toBe(false);
  });

  it('restores bookmarked on both the boost and the original when the status is a boost', () => {
    const before = status('r1', { reblog: status('p1', { bookmarked: false }) });
    const current = status('r1', { bookmarked: true, reblog: status('p1', { bookmarked: true }) });

    const restored = withRestoredBookmark(current, before);

    expect(restored.bookmarked).toBe(false);
    expect(restored.reblog?.bookmarked).toBe(false);
  });
});

describe('runOptimisticBookmark', () => {
  it('shows the bookmark before the server answers, then takes the server status', async () => {
    const timeline = createList([status('p1')]);
    const response = deferred<Status>();
    const request = vi.fn(() => response.promise);

    const running = runOptimisticBookmark({
      postId: 'p1',
      bookmarked: true,
      request,
      updateTimelineItem: timeline.update,
    });

    expect(timeline.get()[0]?.bookmarked).toBe(true);
    const server = status('p1', { bookmarked: true, favourited: true });
    response.resolve(server);
    await running;
    expect(request).toHaveBeenCalledWith('p1');
    expect(timeline.get()[0]).toBe(server);
  });

  it('puts the timeline and the thread back when the request fails, and rethrows', async () => {
    const timeline = createList([status('p1')]);
    const thread = createList([status('p1')]);
    const failure = new Error('network');

    await expect(
      runOptimisticBookmark({
        postId: 'p1',
        bookmarked: true,
        request: () => Promise.reject(failure),
        updateTimelineItem: timeline.update,
        updateThreadPost: thread.update,
      }),
    ).rejects.toBe(failure);

    expect(timeline.get()[0]?.bookmarked).toBe(false);
    expect(thread.get()[0]?.bookmarked).toBe(false);
  });

  it('removes the bookmark optimistically on a boost and restores it on failure', async () => {
    const boost = status('r1', { bookmarked: true, reblog: status('p1', { bookmarked: true }) });
    const timeline = createList([boost]);
    const response = deferred<Status>();

    const running = runOptimisticBookmark({
      postId: 'p1',
      bookmarked: false,
      request: () => response.promise,
      updateTimelineItem: timeline.update,
    });

    expect(timeline.get()[0]?.bookmarked).toBe(false);
    expect(timeline.get()[0]?.reblog?.bookmarked).toBe(false);
    response.reject(new Error('boom'));
    await expect(running).rejects.toThrow('boom');
    expect(timeline.get()[0]?.bookmarked).toBe(true);
    expect(timeline.get()[0]?.reblog?.bookmarked).toBe(true);
  });

  it('ignores a second call for the same post while the first is in flight', async () => {
    const inFlight = new Set<string>();
    const response = deferred<void>();
    const task = vi.fn(() => response.promise);

    const first = runExclusive(inFlight, 'p1', task);
    await runExclusive(inFlight, 'p1', task);
    response.resolve();
    await first;

    expect(task).toHaveBeenCalledTimes(1);
  });
});
