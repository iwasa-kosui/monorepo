import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  blueskyFeedLabel,
  blueskyFeedPostsFailureMessage,
  blueskySavedFeedsFailureMessage,
  fetchBlueskyFeedPosts,
  fetchBlueskySavedFeeds,
} from './blueskyFeedClient.ts';

const FEED = 'at://did:plc:gen/app.bsky.feed.generator/whats-hot';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const stubFetch = (response: Response) => {
  const fetchStub = vi.fn(async (_url: string, _init?: RequestInit) => response);
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
};

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a failure');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchBlueskySavedFeeds', () => {
  it('保存したフィードとリストを取り、名前のない項目はそのまま返す', async () => {
    const feeds = [
      { uri: FEED, kind: 'feed', pinned: true, displayName: 'Hot', avatar: 'https://cdn.example/a.jpg' },
      { uri: 'at://did:plc:own/app.bsky.graph.list/3k', kind: 'list', pinned: false },
    ];
    const fetchStub = stubFetch(json({ feeds }));

    const result = await fetchBlueskySavedFeeds();

    expect(result).toEqual(feeds);
    expect(fetchStub).toHaveBeenCalledExactlyOnceWith('/api/iori/v1/bluesky/feeds', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
  });

  it('形の違う応答は失敗にする', async () => {
    stubFetch(json({ feeds: [{ uri: FEED, kind: 'timeline', pinned: true }] }));

    await expect(fetchBlueskySavedFeeds()).rejects.toThrow('Unexpected saved feeds response');
  });

  it('HTTP の失敗は status と message を持つエラーにする', async () => {
    stubFetch(json({ error: 'Bluesky timeline is disabled' }, 409));

    expect(await failure(fetchBlueskySavedFeeds())).toMatchObject({
      status: 409,
      message: 'Bluesky timeline is disabled',
    });
  });
});

describe('fetchBlueskyFeedPosts', () => {
  it('uri をエンコードし、cursor は指定があるときだけ付ける', async () => {
    const page = { items: [], cursor: 'next' };
    const fetchStub = vi.fn(async (_url: string, _init?: RequestInit) => json(page));
    vi.stubGlobal('fetch', fetchStub);

    const first = await fetchBlueskyFeedPosts(FEED);
    const next = await fetchBlueskyFeedPosts(FEED, 'a b');

    expect(first).toEqual(page);
    expect(next).toEqual(page);
    expect(fetchStub.mock.calls.map(([url]) => url)).toEqual([
      `/api/iori/v1/bluesky/feeds/posts?uri=${encodeURIComponent(FEED)}`,
      `/api/iori/v1/bluesky/feeds/posts?uri=${encodeURIComponent(FEED)}&cursor=a+b`,
    ]);
  });

  it('HTTP の失敗は status を持つエラーにする', async () => {
    stubFetch(json({ error: 'Validation failed: uri' }, 400));

    expect(await failure(fetchBlueskyFeedPosts('x'))).toMatchObject({ status: 400 });
  });
});

describe('blueskyFeedLabel', () => {
  it('名前があればそれを、無ければ名前を取得できなかったことを示す文言にする', () => {
    expect(blueskyFeedLabel({ uri: FEED, kind: 'feed', pinned: false, displayName: 'Hot' })).toBe('Hot');
    expect(blueskyFeedLabel({ uri: FEED, kind: 'feed', pinned: false })).toBe('名前を取得できなかったフィード');
    expect(blueskyFeedLabel({ uri: FEED, kind: 'feed', pinned: false, displayName: '' })).toBe(
      '名前を取得できなかったフィード',
    );
  });

  it('リストで名前が無いときは、リストであることを示す文言にする', () => {
    expect(blueskyFeedLabel({ uri: FEED, kind: 'list', pinned: false })).toBe('名前を取得できなかったリスト');
    expect(blueskyFeedLabel({ uri: FEED, kind: 'list', pinned: false, displayName: '' })).toBe(
      '名前を取得できなかったリスト',
    );
    expect(blueskyFeedLabel({ uri: FEED, kind: 'list', pinned: false, displayName: 'Friends' })).toBe('Friends');
  });
});

describe('失敗の文言', () => {
  it('保存した一覧の読み込み失敗を、ログイン失敗、連携の無効、それ以外で分ける', async () => {
    stubFetch(json({ error: 'Bluesky login failed' }, 502));
    const login = await failure(fetchBlueskySavedFeeds());
    stubFetch(json({ error: 'Bluesky timeline is disabled' }, 409));
    const disabled = await failure(fetchBlueskySavedFeeds());
    stubFetch(json({ error: 'Bluesky request failed' }, 502));
    const other = await failure(fetchBlueskySavedFeeds());

    expect(blueskySavedFeedsFailureMessage(login)).toBe(
      'Bluesky にログインできないため、保存したフィードとリストを読み込めませんでした',
    );
    expect(blueskySavedFeedsFailureMessage(disabled)).toBe('Bluesky 連携が無効です');
    expect(blueskySavedFeedsFailureMessage(other)).toBe('保存したフィードとリストを読み込めませんでした');
    expect(blueskySavedFeedsFailureMessage(new Error('x'))).toBe('保存したフィードとリストを読み込めませんでした');
  });

  it('投稿の読み込み失敗を、ログイン失敗、連携の無効、それ以外で分け、最初と続きで文言を変える', async () => {
    stubFetch(json({ error: 'Bluesky login failed' }, 502));
    const login = await failure(fetchBlueskyFeedPosts(FEED));
    stubFetch(json({ error: 'Bluesky timeline is disabled' }, 409));
    const disabled = await failure(fetchBlueskyFeedPosts(FEED));
    stubFetch(json({ error: 'Bluesky request failed' }, 502));
    const other = await failure(fetchBlueskyFeedPosts(FEED));

    expect(blueskyFeedPostsFailureMessage(login, 'first')).toBe(
      'Bluesky にログインできないため、投稿を読み込めませんでした',
    );
    expect(blueskyFeedPostsFailureMessage(login, 'more')).toBe(
      'Bluesky にログインできないため、続きを読み込めませんでした',
    );
    expect(blueskyFeedPostsFailureMessage(disabled, 'first')).toBe('Bluesky 連携が無効です');
    expect(blueskyFeedPostsFailureMessage(other, 'first')).toBe('投稿を読み込めませんでした');
    expect(blueskyFeedPostsFailureMessage(other, 'more')).toBe('続きを読み込めませんでした');
    expect(blueskyFeedPostsFailureMessage(new Error('x'), 'first')).toBe('投稿を読み込めませんでした');
  });
});
