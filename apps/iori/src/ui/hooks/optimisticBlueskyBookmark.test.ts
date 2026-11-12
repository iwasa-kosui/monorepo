import { describe, expect, it, vi } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import {
  runOptimisticBlueskyBookmark,
  withBlueskyBookmarked,
  withRestoredBlueskyBookmarked,
} from './optimisticBlueskyBookmark.ts';

const item = (feedItemId: string, uri: string, bookmarked: boolean): IoriBlueskyTimelineItemBody =>
  ({ feedItemId, uri, bookmarked }) as IoriBlueskyTimelineItemBody;

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

describe('withBlueskyBookmarked', () => {
  it('同じ uri の通常の行と repost の行をすべて変え、別の uri の行は変えない', () => {
    const items = [
      item('plain', POST, false),
      item(`${POST}#repost:did:plc:b`, POST, false),
      item('other', OTHER, false),
    ];

    const result = withBlueskyBookmarked(items, POST, true);

    expect(result.map((entry) => [entry.feedItemId, entry.bookmarked])).toEqual([
      ['plain', true],
      [`${POST}#repost:did:plc:b`, true],
      ['other', false],
    ]);
    expect(result[2]).toBe(items[2]);
  });

  it('すでに同じ値の行は同じオブジェクトのまま返す', () => {
    const items = [item('plain', POST, true)];

    expect(withBlueskyBookmarked(items, POST, true)[0]).toBe(items[0]);
  });
});

describe('withRestoredBlueskyBookmarked', () => {
  it('記録した値に戻し、記録にない行は変えない', () => {
    const items = [item('a', POST, true), item('b', POST, true), item('c', OTHER, true)];

    const result = withRestoredBlueskyBookmarked(items, POST, new Map([['a', false]]));

    expect(result.map((entry) => entry.bookmarked)).toEqual([false, true, true]);
  });
});

describe('runOptimisticBlueskyBookmark', () => {
  const items =
    () => [item('plain', POST, false), item(`${POST}#repost:did:plc:b`, POST, false), item('o', OTHER, false)];

  it('押した時点で同じ uri のすべての行を変え、成功したらサーバーの結果で確定する', async () => {
    const list = createItems(items());
    const pending = deferred<{ bookmarked: boolean }>();
    const request = vi.fn(() => pending.promise);

    const done = runOptimisticBlueskyBookmark({
      feedItemId: 'plain',
      uri: POST,
      bookmarked: true,
      request,
      updateItems: list.update,
    });

    expect(list.get().map((entry) => entry.bookmarked)).toEqual([true, true, false]);
    expect(request).toHaveBeenCalledExactlyOnceWith('plain');

    pending.resolve({ bookmarked: true });
    await done;

    expect(list.get().map((entry) => entry.bookmarked)).toEqual([true, true, false]);
  });

  it('外す操作でも、一覧から項目を消さずにメニューの状態だけを変える', async () => {
    const list = createItems([item('plain', POST, true)]);

    await runOptimisticBlueskyBookmark({
      feedItemId: 'plain',
      uri: POST,
      bookmarked: false,
      request: async () => ({ bookmarked: false }),
      updateItems: list.update,
    });

    expect(list.get().map((entry) => [entry.feedItemId, entry.bookmarked])).toEqual([['plain', false]]);
  });

  it('失敗したら押す前の表示に戻し、エラーを投げ直す', async () => {
    const list = createItems([item('plain', POST, true), item('repost', POST, true), item('o', OTHER, false)]);
    const failure = new Error('502');

    await expect(runOptimisticBlueskyBookmark({
      feedItemId: 'plain',
      uri: POST,
      bookmarked: false,
      request: async () => {
        throw failure;
      },
      updateItems: list.update,
    })).rejects.toBe(failure);

    expect(list.get().map((entry) => entry.bookmarked)).toEqual([true, true, false]);
  });

  it('押している間に別の行が追加されても、失敗の巻き戻しでその行は変えない', async () => {
    const list = createItems([item('plain', POST, false)]);
    const pending = deferred<{ bookmarked: boolean }>();

    const done = runOptimisticBlueskyBookmark({
      feedItemId: 'plain',
      uri: POST,
      bookmarked: true,
      request: () => pending.promise,
      updateItems: list.update,
    });
    list.update((current) => [...current, item('late', POST, true)]);
    pending.reject(new Error('502'));
    await done.catch(() => undefined);

    expect(list.get().map((entry) => [entry.feedItemId, entry.bookmarked])).toEqual([
      ['plain', false],
      ['late', true],
    ]);
  });
});
