import { describe, expect, it, vi } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { runOptimisticBlueskyLike, withBlueskyLiked, withRestoredBlueskyLiked } from './optimisticBlueskyLike.ts';

const item = (feedItemId: string, uri: string, liked: boolean): IoriBlueskyTimelineItemBody =>
  ({ feedItemId, uri, liked }) as IoriBlueskyTimelineItemBody;

const POST = 'at://did:plc:a/app.bsky.feed.post/1';
const OTHER = 'at://did:plc:a/app.bsky.feed.post/2';

const createItems = (initial: readonly IoriBlueskyTimelineItemBody[]) => {
  let current = initial;
  return {
    get: () => current,
    update: (updater: (items: readonly IoriBlueskyTimelineItemBody[]) => readonly IoriBlueskyTimelineItemBody[]) => {
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

describe('withBlueskyLiked', () => {
  it('同じ uri の通常の行と repost の行をすべて変え、別の uri の行は変えない', () => {
    const items = [
      item('plain', POST, false),
      item(`${POST}#repost:did:plc:b`, POST, false),
      item('other', OTHER, false),
    ];

    const result = withBlueskyLiked(items, POST, true);

    expect(result.map((entry) => [entry.feedItemId, entry.liked])).toEqual([
      ['plain', true],
      [`${POST}#repost:did:plc:b`, true],
      ['other', false],
    ]);
    expect(result[2]).toBe(items[2]);
  });

  it('すでに同じ値の行は同じオブジェクトのまま返す', () => {
    const items = [item('plain', POST, true)];

    expect(withBlueskyLiked(items, POST, true)[0]).toBe(items[0]);
  });
});

describe('withRestoredBlueskyLiked', () => {
  it('記録した値に戻し、記録にない行は変えない', () => {
    const items = [item('a', POST, true), item('b', POST, true), item('c', OTHER, true)];

    const result = withRestoredBlueskyLiked(items, POST, new Map([['a', false]]));

    expect(result.map((entry) => entry.liked)).toEqual([false, true, true]);
  });
});

describe('runOptimisticBlueskyLike', () => {
  const items =
    () => [item('plain', POST, false), item(`${POST}#repost:did:plc:b`, POST, false), item('o', OTHER, false)];

  it('押した時点で同じ uri のすべての行を変え、成功したらサーバーの結果で確定する', async () => {
    const list = createItems(items());
    const pending = deferred<{ liked: boolean }>();
    const request = vi.fn(() => pending.promise);

    const done = runOptimisticBlueskyLike({
      feedItemId: 'plain',
      uri: POST,
      liked: true,
      request,
      updateItems: list.update,
    });

    expect(list.get().map((entry) => entry.liked)).toEqual([true, true, false]);
    expect(request).toHaveBeenCalledExactlyOnceWith('plain');

    pending.resolve({ liked: true });
    await done;

    expect(list.get().map((entry) => entry.liked)).toEqual([true, true, false]);
  });

  it('サーバーが別の結果を返したら、その結果で確定する', async () => {
    const list = createItems(items());

    await runOptimisticBlueskyLike({
      feedItemId: 'plain',
      uri: POST,
      liked: true,
      request: async () => ({ liked: false }),
      updateItems: list.update,
    });

    expect(list.get().map((entry) => entry.liked)).toEqual([false, false, false]);
  });

  it('失敗したら押す前の表示に戻し、エラーを投げ直す', async () => {
    const list = createItems([item('plain', POST, true), item('repost', POST, true), item('o', OTHER, false)]);
    const failure = new Error('502');

    await expect(runOptimisticBlueskyLike({
      feedItemId: 'plain',
      uri: POST,
      liked: false,
      request: async () => {
        throw failure;
      },
      updateItems: list.update,
    })).rejects.toBe(failure);

    expect(list.get().map((entry) => entry.liked)).toEqual([true, true, false]);
  });

  it('押している間に別の行が追加されても、失敗の巻き戻しでその行は変えない', async () => {
    const list = createItems([item('plain', POST, false)]);
    const pending = deferred<{ liked: boolean }>();

    const done = runOptimisticBlueskyLike({
      feedItemId: 'plain',
      uri: POST,
      liked: true,
      request: () => pending.promise,
      updateItems: list.update,
    });
    list.update((current) => [...current, item('late', POST, true)]);
    pending.reject(new Error('502'));
    await done.catch(() => undefined);

    expect(list.get().map((entry) => [entry.feedItemId, entry.liked])).toEqual([['plain', false], ['late', true]]);
  });
});
