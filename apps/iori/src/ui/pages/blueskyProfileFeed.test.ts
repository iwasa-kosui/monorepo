import { describe, expect, it } from 'vitest';

import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { appendUniqueBy } from '../hooks/appendUnique.ts';
import { withBlueskyLiked } from '../hooks/optimisticBlueskyLike.ts';
import {
  cachedFeedOf,
  emptyFeedCache,
  type FeedCache,
  shouldFetchFeed,
  withCachedFeed,
  withCachedFeedItems,
  withFeedItems,
  withoutCachedFeed,
  withUpdatedCachedFeed,
} from './blueskyProfileFeed.ts';

const item = (uri: string, liked = false): IoriBlueskyTimelineItemBody =>
  ({ feedItemId: uri, uri, liked }) as IoriBlueskyTimelineItemBody;

const feed = {
  items: [item('at://a/1'), item('at://a/2')],
  cursor: 'c2' as string | undefined,
  unavailable: null,
  failed: false,
};

describe('withFeedItems', () => {
  it('feed の項目を uri で書き換え、cursor などはそのまま残す', () => {
    const next = withFeedItems(feed, (items) => withBlueskyLiked(items, 'at://a/1', true));

    expect(next).toEqual({ ...feed, items: [item('at://a/1', true), item('at://a/2')] });
  });

  it('項目の配列が変わらなければ同じ feed をそのまま返す', () => {
    expect(withFeedItems(feed, (items) => items)).toBe(feed);
  });

  it('feed がまだ読み込まれていなければ何もしない', () => {
    expect(withFeedItems(null, (items) => [...items, item('at://a/3')])).toBeNull();
  });

  it('楽観更新のあとに続きを足しても、更新した項目は残る', () => {
    const liked = withFeedItems(feed, (items) => withBlueskyLiked(items, 'at://a/2', true));

    const appended = withFeedItems(
      liked,
      (items) => appendUniqueBy(items, [item('at://a/2'), item('at://a/3')], (entry) => entry.feedItemId),
    );

    expect(appended?.items).toEqual([item('at://a/1'), item('at://a/2', true), item('at://a/3')]);
  });
});

type TestFeed = Readonly<{
  items: readonly IoriBlueskyTimelineItemBody[];
  cursor: string | undefined;
  unavailable: 'blocked' | null;
  failed: boolean;
}>;

const POSTS = 'posts_and_author_threads';
const REPLIES = 'posts_with_replies';

const loadedFeed = (cursor: string | undefined, ...uris: string[]): TestFeed => ({
  items: uris.map((uri) => item(uri)),
  cursor,
  unavailable: null,
  failed: false,
});

describe('フィードのタブごとのキャッシュ', () => {
  const loadedPosts = (): FeedCache<TestFeed> => {
    const first = withCachedFeed(emptyFeedCache<TestFeed>(), 'alice', POSTS, loadedFeed('c1', 'at://a/1'));
    return withUpdatedCachedFeed(first, 'alice', POSTS, (prev) => ({
      ...prev,
      items: [...prev.items, item('at://a/2')],
      cursor: 'c2',
    }));
  };

  it('まだ読み込んでいない filter は取得する', () => {
    expect(shouldFetchFeed(emptyFeedCache<TestFeed>(), 'alice', POSTS)).toBe(true);
    expect(shouldFetchFeed(null, 'alice', POSTS)).toBe(true);
  });

  it('投稿でページを読み込んだあと、フィードを経由して投稿へ戻っても再取得せず items と cursor が残る', () => {
    const cache = loadedPosts();

    expect(shouldFetchFeed(cache, 'alice', undefined)).toBe(false);
    expect(shouldFetchFeed(cache, 'alice', POSTS)).toBe(false);
    expect(cachedFeedOf(cache, 'alice', POSTS)).toEqual(loadedFeed('c2', 'at://a/1', 'at://a/2'));
  });

  it('投稿から返信へ移って投稿へ戻っても、投稿の items と cursor が残り、返信は取得する', () => {
    const cache = loadedPosts();

    expect(shouldFetchFeed(cache, 'alice', REPLIES)).toBe(true);
    const withReplies = withCachedFeed(
      withoutCachedFeed(cache, 'alice', REPLIES),
      'alice',
      REPLIES,
      loadedFeed('r1', 'at://a/r1'),
    );

    expect(shouldFetchFeed(withReplies, 'alice', POSTS)).toBe(false);
    expect(cachedFeedOf(withReplies, 'alice', POSTS)).toEqual(loadedFeed('c2', 'at://a/1', 'at://a/2'));
    expect(cachedFeedOf(withReplies, 'alice', REPLIES)).toEqual(loadedFeed('r1', 'at://a/r1'));
  });

  it('取得に失敗した filter は戻ったときに取り直す', () => {
    const failed = withCachedFeed(emptyFeedCache<TestFeed>(), 'alice', POSTS, {
      items: [],
      cursor: undefined,
      unavailable: null,
      failed: true,
    });

    expect(shouldFetchFeed(failed, 'alice', POSTS)).toBe(true);
    expect(cachedFeedOf(withoutCachedFeed(failed, 'alice', POSTS), 'alice', POSTS)).toBeUndefined();
  });

  it('続きの読み込みは、その filter だけの cursor と items を更新する', () => {
    const withReplies = withCachedFeed(loadedPosts(), 'alice', REPLIES, loadedFeed('r1', 'at://a/r1'));

    const next = withUpdatedCachedFeed(withReplies, 'alice', REPLIES, (prev) => ({ ...prev, cursor: undefined }));

    expect(cachedFeedOf(next, 'alice', REPLIES)?.cursor).toBeUndefined();
    expect(cachedFeedOf(next, 'alice', POSTS)).toEqual(cachedFeedOf(withReplies, 'alice', POSTS));
  });

  it('actor が変わるとキャッシュが消える', () => {
    const cache = loadedPosts();

    expect(cachedFeedOf(cache, 'bob', POSTS)).toBeUndefined();
    expect(shouldFetchFeed(cache, 'bob', POSTS)).toBe(true);
    expect(withUpdatedCachedFeed(cache, 'bob', POSTS, (prev) => ({ ...prev, cursor: undefined }))).toBe(cache);

    const next = withCachedFeed(cache, 'bob', REPLIES, loadedFeed(undefined, 'at://b/1'));

    expect(next.actor).toBe('bob');
    expect(cachedFeedOf(next, 'bob', POSTS)).toBeUndefined();
    expect(cachedFeedOf(next, 'alice', POSTS)).toBeUndefined();
  });

  it('updateItems 相当の更新は、キャッシュ済みのすべての filter の items に効く', () => {
    const cache = withCachedFeed(loadedPosts(), 'alice', REPLIES, loadedFeed('r1', 'at://a/2', 'at://a/r1'));

    const next = withCachedFeedItems(cache, (items) => withBlueskyLiked(items, 'at://a/2', true));

    expect(cachedFeedOf(next, 'alice', POSTS)?.items).toEqual([item('at://a/1'), item('at://a/2', true)]);
    expect(cachedFeedOf(next, 'alice', REPLIES)?.items).toEqual([item('at://a/2', true), item('at://a/r1')]);
    expect(cachedFeedOf(next, 'alice', POSTS)?.cursor).toBe('c2');
    expect(next.actor).toBe('alice');
  });

  it('どの items も変わらなければ同じキャッシュをそのまま返す', () => {
    const cache = loadedPosts();

    expect(withCachedFeedItems(cache, (items) => items)).toBe(cache);
    expect(withCachedFeedItems(emptyFeedCache<TestFeed>(), (items) => [...items, item('at://a/9')]).feeds).toEqual({});
  });
});
