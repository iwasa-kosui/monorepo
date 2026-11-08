import { describe, expect, it, vi } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { runExclusive, runOptimisticFavourite, withOptimisticFavourite } from './optimisticFavourite.ts';

const status = (id: string, overrides: Partial<Status> = {}): Status =>
  ({
    id,
    reblog: null,
    favourited: false,
    reblogged: false,
    favourites_count: 0,
    ...overrides,
  }) as Status;

const createTimeline = (initial: Status) => {
  let current = initial;
  return {
    get: () => current,
    update: (_postId: string, updater: (status: Status) => Status) => {
      current = updater(current);
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

describe('withOptimisticFavourite', () => {
  it('marks the status as favourited and adds one to the count', () => {
    const result = withOptimisticFavourite(status('p1', { favourites_count: 2 }), true);
    expect(result.favourited).toBe(true);
    expect(result.favourites_count).toBe(3);
  });

  it('marks the status as not favourited and subtracts one from the count', () => {
    const result = withOptimisticFavourite(status('p1', { favourited: true, favourites_count: 2 }), false);
    expect(result.favourited).toBe(false);
    expect(result.favourites_count).toBe(1);
  });

  it('does not let the count go below zero when undoing', () => {
    const result = withOptimisticFavourite(status('p1', { favourited: true, favourites_count: 0 }), false);
    expect(result.favourites_count).toBe(0);
  });

  it('updates the reblogged original, which is what the timeline displays, when the item is a boost', () => {
    const original = status('p1', { favourites_count: 4 });
    const boost = status('b1', { reblog: original, favourites_count: 9 });
    const result = withOptimisticFavourite(boost, true);
    expect(result.favourited).toBe(true);
    expect(result.reblog?.favourited).toBe(true);
    expect(result.reblog?.favourites_count).toBe(5);
    expect(result.favourites_count).toBe(9);
  });

  it('does not change the original status object', () => {
    const original = status('p1', { favourites_count: 1 });
    withOptimisticFavourite(original, true);
    expect(original.favourited).toBe(false);
    expect(original.favourites_count).toBe(1);
  });
});

describe('runOptimisticFavourite', () => {
  it('shows the item as favourited while the request is still pending', async () => {
    const timeline = createTimeline(status('p1', { favourites_count: 2 }));
    const pending = deferred<Status>();
    const request = vi.fn(() => pending.promise);

    const running = runOptimisticFavourite({
      postId: 'p1',
      favourited: true,
      request,
      updateTimelineItem: timeline.update,
    });

    expect(request).toHaveBeenCalledWith('p1');
    expect(timeline.get().favourited).toBe(true);
    expect(timeline.get().favourites_count).toBe(3);

    pending.resolve(status('p1', { favourited: true, favourites_count: 3 }));
    await running;
  });

  it('replaces the item with the server status on success', async () => {
    const timeline = createTimeline(status('p1', { favourites_count: 2 }));
    const pending = deferred<Status>();
    const updateThreadPost = vi.fn();

    const running = runOptimisticFavourite({
      postId: 'p1',
      favourited: true,
      request: () => pending.promise,
      updateTimelineItem: timeline.update,
      updateThreadPost,
    });
    const server = status('p1', { favourited: true, favourites_count: 7 });
    pending.resolve(server);
    await running;

    expect(timeline.get()).toBe(server);
    expect(updateThreadPost).toHaveBeenCalledTimes(2);
  });

  it('restores the value saved before the press and rethrows when the request rejects', async () => {
    const before = status('p1', { favourites_count: 2 });
    const timeline = createTimeline(before);
    const failure = new Error('network');
    const updateThreadPost = vi.fn();

    await expect(
      runOptimisticFavourite({
        postId: 'p1',
        favourited: true,
        request: () => Promise.reject(failure),
        updateTimelineItem: timeline.update,
        updateThreadPost,
      }),
    ).rejects.toBe(failure);

    expect(timeline.get()).toEqual(before);
    expect(updateThreadPost).toHaveBeenCalledTimes(1);
  });

  it('shows the item as not favourited with one fewer like while an undo is pending, then takes the server status', async () => {
    const timeline = createTimeline(status('p1', { favourited: true, favourites_count: 3 }));
    const pending = deferred<Status>();

    const running = runOptimisticFavourite({
      postId: 'p1',
      favourited: false,
      request: () => pending.promise,
      updateTimelineItem: timeline.update,
    });

    expect(timeline.get().favourited).toBe(false);
    expect(timeline.get().favourites_count).toBe(2);

    const server = status('p1', { favourited: false, favourites_count: 2 });
    pending.resolve(server);
    await running;

    expect(timeline.get()).toBe(server);
  });

  it('restores the liked state when an undo fails', async () => {
    const before = status('p1', { favourited: true, favourites_count: 3 });
    const timeline = createTimeline(before);

    await expect(
      runOptimisticFavourite({
        postId: 'p1',
        favourited: false,
        request: () => Promise.reject(new Error('server')),
        updateTimelineItem: timeline.update,
      }),
    ).rejects.toThrow('server');

    expect(timeline.get()).toEqual(before);
  });

  it('keeps the count at zero when undoing a like on an item with no likes', async () => {
    const timeline = createTimeline(status('p1', { favourited: true, favourites_count: 0 }));
    const pending = deferred<Status>();

    const running = runOptimisticFavourite({
      postId: 'p1',
      favourited: false,
      request: () => pending.promise,
      updateTimelineItem: timeline.update,
    });

    expect(timeline.get().favourites_count).toBe(0);

    pending.resolve(status('p1'));
    await running;
  });

  it('shows the thread post as favourited while pending and takes the server status on success', async () => {
    const timeline = createTimeline(status('p1', { favourites_count: 2 }));
    const thread = createTimeline(status('p1', { favourites_count: 2 }));
    const pending = deferred<Status>();

    const running = runOptimisticFavourite({
      postId: 'p1',
      favourited: true,
      request: () => pending.promise,
      updateTimelineItem: timeline.update,
      updateThreadPost: thread.update,
    });

    expect(thread.get().favourited).toBe(true);
    expect(thread.get().favourites_count).toBe(3);

    const server = status('p1', { favourited: true, favourites_count: 3 });
    pending.resolve(server);
    await running;

    expect(thread.get()).toBe(server);
  });

  it('restores the thread post saved before the press when the request rejects', async () => {
    const timelineBefore = status('p1', { favourites_count: 2 });
    const threadBefore = status('p1', { favourites_count: 5 });
    const timeline = createTimeline(timelineBefore);
    const thread = createTimeline(threadBefore);

    await expect(
      runOptimisticFavourite({
        postId: 'p1',
        favourited: true,
        request: () => Promise.reject(new Error('network')),
        updateTimelineItem: timeline.update,
        updateThreadPost: thread.update,
      }),
    ).rejects.toThrow('network');

    expect(timeline.get()).toEqual(timelineBefore);
    expect(thread.get()).toEqual(threadBefore);
  });

  it('works when the post exists only in the thread', async () => {
    const threadBefore = status('p1', { favourites_count: 1 });
    const thread = createTimeline(threadBefore);
    const pending = deferred<Status>();

    const running = runOptimisticFavourite({
      postId: 'p1',
      favourited: true,
      request: () => pending.promise,
      updateTimelineItem: () => {},
      updateThreadPost: thread.update,
    });

    expect(thread.get().favourited).toBe(true);
    expect(thread.get().favourites_count).toBe(2);

    pending.reject(new Error('server'));
    await expect(running).rejects.toThrow('server');

    expect(thread.get()).toEqual(threadBefore);
  });

  it('keeps an update to another field that arrived while the request was pending when it fails', async () => {
    const timeline = createTimeline(status('p1', { favourites_count: 2, reblogs_count: 0 }));
    const pending = deferred<Status>();

    const running = runOptimisticFavourite({
      postId: 'p1',
      favourited: true,
      request: () => pending.promise,
      updateTimelineItem: timeline.update,
    });
    timeline.update('p1', (current) => ({ ...current, reblogs_count: 4 }));

    pending.reject(new Error('network'));
    await expect(running).rejects.toThrow('network');

    expect(timeline.get().reblogs_count).toBe(4);
    expect(timeline.get().favourited).toBe(false);
    expect(timeline.get().favourites_count).toBe(2);
  });

  it('restores only the displayed original of a boost and keeps other changes to it', async () => {
    const original = status('p1', { favourites_count: 4, reblogs_count: 1 });
    const timeline = createTimeline(status('b1', { reblog: original, favourites_count: 9 }));
    const pending = deferred<Status>();

    const running = runOptimisticFavourite({
      postId: 'p1',
      favourited: true,
      request: () => pending.promise,
      updateTimelineItem: timeline.update,
    });
    timeline.update('p1', (current) => ({
      ...current,
      reblog: current.reblog === null ? null : { ...current.reblog, reblogs_count: 6 },
    }));

    pending.reject(new Error('network'));
    await expect(running).rejects.toThrow('network');

    expect(timeline.get().favourited).toBe(false);
    expect(timeline.get().favourites_count).toBe(9);
    expect(timeline.get().reblog?.favourited).toBe(false);
    expect(timeline.get().reblog?.favourites_count).toBe(4);
    expect(timeline.get().reblog?.reblogs_count).toBe(6);
  });
});

describe('runExclusive', () => {
  it('does not start a second task for the same post while the first is in flight', async () => {
    const inFlight = new Set<string>();
    const pending = deferred<void>();
    const first = vi.fn(() => pending.promise);
    const second = vi.fn(async () => {});

    const running = runExclusive(inFlight, 'p1', first);
    await runExclusive(inFlight, 'p1', second);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    pending.resolve();
    await running;
  });

  it('allows the post to be operated on again after the task completes', async () => {
    const inFlight = new Set<string>();
    const task = vi.fn(async () => {});

    await runExclusive(inFlight, 'p1', task);
    await runExclusive(inFlight, 'p1', task);

    expect(task).toHaveBeenCalledTimes(2);
  });

  it('allows the post to be operated on again after the task fails', async () => {
    const inFlight = new Set<string>();
    const task = vi.fn(async () => {});

    await expect(runExclusive(inFlight, 'p1', () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await runExclusive(inFlight, 'p1', task);

    expect(task).toHaveBeenCalledTimes(1);
  });

  it('does not block a different post', async () => {
    const inFlight = new Set<string>();
    const pending = deferred<void>();
    const other = vi.fn(async () => {});

    const running = runExclusive(inFlight, 'p1', () => pending.promise);
    await runExclusive(inFlight, 'p2', other);

    expect(other).toHaveBeenCalledTimes(1);

    pending.resolve();
    await running;
  });

  it('does not call the request for a second favourite on the same post while the first is pending', async () => {
    const inFlight = new Set<string>();
    const timeline = createTimeline(status('p1'));
    const pending = deferred<Status>();
    const request = vi.fn(() => pending.promise);
    const run = (favourited: boolean) =>
      runExclusive(
        inFlight,
        'p1',
        () => runOptimisticFavourite({ postId: 'p1', favourited, request, updateTimelineItem: timeline.update }),
      );

    const first = run(true);
    await run(false);

    expect(request).toHaveBeenCalledTimes(1);
    expect(timeline.get().favourited).toBe(true);

    pending.resolve(status('p1', { favourited: true, favourites_count: 1 }));
    await first;
  });
});
