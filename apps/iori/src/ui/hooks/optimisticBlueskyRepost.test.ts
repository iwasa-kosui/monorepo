import { describe, expect, it, vi } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import {
  runOptimisticBlueskyRepost,
  withBlueskyReposted,
  withRestoredBlueskyReposted,
} from './optimisticBlueskyRepost.ts';

const item = (feedItemId: string, uri: string, reposted: boolean): IoriBlueskyTimelineItemBody =>
  ({ feedItemId, uri, reposted }) as IoriBlueskyTimelineItemBody;

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

describe('withBlueskyReposted', () => {
  it('同じ uri の通常の行と repost の行をすべて変え、別の uri の行は変えない', () => {
    const items = [
      item('plain', POST, false),
      item(`${POST}#repost:did:plc:b`, POST, false),
      item('other', OTHER, false),
    ];

    const result = withBlueskyReposted(items, POST, true);

    expect(result.map((entry) => [entry.feedItemId, entry.reposted])).toEqual([
      ['plain', true],
      [`${POST}#repost:did:plc:b`, true],
      ['other', false],
    ]);
    expect(result[2]).toBe(items[2]);
  });

  it('すでに同じ値の行は同じオブジェクトのまま返す', () => {
    const items = [item('plain', POST, true)];

    expect(withBlueskyReposted(items, POST, true)[0]).toBe(items[0]);
  });
});

describe('withRestoredBlueskyReposted', () => {
  it('記録した値に戻し、記録にない行は変えない', () => {
    const items = [item('a', POST, true), item('b', POST, true), item('c', OTHER, true)];

    const result = withRestoredBlueskyReposted(items, POST, new Map([['a', false]]));

    expect(result.map((entry) => entry.reposted)).toEqual([false, true, true]);
  });
});

describe('runOptimisticBlueskyRepost', () => {
  const items =
    () => [item('plain', POST, false), item(`${POST}#repost:did:plc:b`, POST, false), item('o', OTHER, false)];

  it('押した時点で同じ uri のすべての行を変え、成功したらサーバーの結果で確定する', async () => {
    const list = createItems(items());
    const pending = deferred<{ reposted: boolean }>();
    const request = vi.fn(() => pending.promise);

    const done = runOptimisticBlueskyRepost({
      feedItemId: 'plain',
      uri: POST,
      reposted: true,
      request,
      updateItems: list.update,
    });

    expect(list.get().map((entry) => entry.reposted)).toEqual([true, true, false]);
    expect(request).toHaveBeenCalledExactlyOnceWith('plain');

    pending.resolve({ reposted: true });
    await done;

    expect(list.get().map((entry) => entry.reposted)).toEqual([true, true, false]);
  });

  it('サーバーが別の結果を返したら、その結果で確定する', async () => {
    const list = createItems(items());

    await runOptimisticBlueskyRepost({
      feedItemId: 'plain',
      uri: POST,
      reposted: true,
      request: async () => ({ reposted: false }),
      updateItems: list.update,
    });

    expect(list.get().map((entry) => entry.reposted)).toEqual([false, false, false]);
  });

  it('失敗したら押す前の表示に戻し、エラーを投げ直す', async () => {
    const list = createItems([item('plain', POST, true), item('repost', POST, true), item('o', OTHER, false)]);
    const failure = new Error('502');

    await expect(runOptimisticBlueskyRepost({
      feedItemId: 'plain',
      uri: POST,
      reposted: false,
      request: async () => {
        throw failure;
      },
      updateItems: list.update,
    })).rejects.toBe(failure);

    expect(list.get().map((entry) => entry.reposted)).toEqual([true, true, false]);
  });

  it('押している間に別の行が追加されても、失敗の巻き戻しでその行は変えない', async () => {
    const list = createItems([item('plain', POST, false)]);
    const pending = deferred<{ reposted: boolean }>();

    const done = runOptimisticBlueskyRepost({
      feedItemId: 'plain',
      uri: POST,
      reposted: true,
      request: () => pending.promise,
      updateItems: list.update,
    });
    list.update((current) => [...current, item('late', POST, true)]);
    pending.reject(new Error('502'));
    await done.catch(() => undefined);

    expect(list.get().map((entry) => [entry.feedItemId, entry.reposted])).toEqual([
      ['plain', false],
      ['late', true],
    ]);
  });

  it('いいねの状態は変えない', async () => {
    const list = createItems([{ ...item('plain', POST, false), liked: true } as IoriBlueskyTimelineItemBody]);

    await runOptimisticBlueskyRepost({
      feedItemId: 'plain',
      uri: POST,
      reposted: true,
      request: async () => ({ reposted: true }),
      updateItems: list.update,
    });

    expect(list.get().map((entry) => [entry.liked, entry.reposted])).toEqual([[true, true]]);
  });
});
