import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  blueskyActorFeedsFailureMessage,
  blueskyActorListsFailureMessage,
  blueskyFeedInfoFailureMessage,
  blueskyFeedLabel,
  blueskyFeedPostsFailureMessage,
  blueskyFeedUrlFailureMessage,
  blueskyListMembersFailureMessage,
  blueskySavedFeedsFailureMessage,
  fetchBlueskyActorFeeds,
  fetchBlueskyActorLists,
  fetchBlueskyFeedInfo,
  fetchBlueskyFeedPosts,
  fetchBlueskyListMembers,
  fetchBlueskySavedFeeds,
  resolveBlueskyFeedUrl,
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
    expect(blueskyFeedLabel({ uri: FEED, kind: 'list', pinned: false, displayName: '' })).toBe(
      '名前を取得できなかったフィード',
    );
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

const LIST = 'at://did:plc:own/app.bsky.graph.list/3k';

describe('fetchBlueskyFeedInfo', () => {
  it('uri をエンコードして一覧の項目を取る', async () => {
    const info = { uri: FEED, kind: 'feed', pinned: false, displayName: 'Hot' };
    const fetchStub = stubFetch(json(info));

    expect(await fetchBlueskyFeedInfo(FEED)).toEqual(info);
    expect(fetchStub).toHaveBeenCalledExactlyOnceWith(
      `/api/iori/v1/bluesky/feeds/info?uri=${encodeURIComponent(FEED)}`,
      { headers: { Accept: 'application/json' }, credentials: 'same-origin' },
    );
  });

  it('形の違う応答は失敗にし、HTTP の失敗は status を持つエラーにする', async () => {
    stubFetch(json({ uri: FEED, kind: 'timeline', pinned: false }));
    await expect(fetchBlueskyFeedInfo(FEED)).rejects.toThrow('Unexpected feed info response');
    stubFetch(json({ error: 'Feed not found' }, 404));

    expect(await failure(fetchBlueskyFeedInfo(FEED))).toMatchObject({ status: 404 });
  });
});

describe('resolveBlueskyFeedUrl', () => {
  it('url をエンコードして at-uri を取る', async () => {
    const url = 'https://bsky.app/profile/alice.bsky.social/feed/hot';
    const fetchStub = stubFetch(json({ uri: FEED }));

    expect(await resolveBlueskyFeedUrl(url)).toBe(FEED);
    expect(fetchStub.mock.calls.map(([target]) => target)).toEqual([
      `/api/iori/v1/bluesky/feeds/resolve?url=${encodeURIComponent(url)}`,
    ]);
  });

  it('形の違う応答は失敗にし、HTTP の失敗は status を持つエラーにする', async () => {
    stubFetch(json({}));
    await expect(resolveBlueskyFeedUrl('x')).rejects.toThrow('Unexpected feed resolve response');
    stubFetch(json({ error: 'Validation failed: url' }, 400));

    expect(await failure(resolveBlueskyFeedUrl('x'))).toMatchObject({ status: 400 });
  });
});

describe('fetchBlueskyListMembers', () => {
  it('uri をエンコードし、cursor は指定があるときだけ付ける', async () => {
    const page = { actors: [], cursor: 'next' };
    const fetchStub = vi.fn(async (_url: string, _init?: RequestInit) => json(page));
    vi.stubGlobal('fetch', fetchStub);

    expect(await fetchBlueskyListMembers(LIST)).toEqual(page);
    await fetchBlueskyListMembers(LIST, 'a b');

    expect(fetchStub.mock.calls.map(([url]) => url)).toEqual([
      `/api/iori/v1/bluesky/lists/members?uri=${encodeURIComponent(LIST)}`,
      `/api/iori/v1/bluesky/lists/members?uri=${encodeURIComponent(LIST)}&cursor=a+b`,
    ]);
  });

  it('HTTP の失敗は status を持つエラーにする', async () => {
    stubFetch(json({ error: 'Validation failed: uri' }, 400));

    expect(await failure(fetchBlueskyListMembers('x'))).toMatchObject({ status: 400 });
  });
});

describe('fetchBlueskyActorFeeds と fetchBlueskyActorLists', () => {
  it('actor をエンコードし、cursor は指定があるときだけ付け、項目を items にそろえて返す', async () => {
    const item = { uri: FEED, kind: 'feed', pinned: false };
    const listItem = { uri: LIST, kind: 'list', pinned: false };
    const fetchStub = vi.fn(async (url: string, _init?: RequestInit) =>
      json(url.includes('/feeds') ? { feeds: [item], cursor: 'n1' } : { lists: [listItem], cursor: null })
    );
    vi.stubGlobal('fetch', fetchStub);

    expect(await fetchBlueskyActorFeeds('did:plc:alice', 'a b')).toEqual({ items: [item], cursor: 'n1' });
    expect(await fetchBlueskyActorLists('alice.bsky.social')).toEqual({ items: [listItem], cursor: null });

    expect(fetchStub.mock.calls.map(([url]) => url)).toEqual([
      '/api/iori/v1/bluesky/profiles/did%3Aplc%3Aalice/feeds?cursor=a+b',
      '/api/iori/v1/bluesky/profiles/alice.bsky.social/lists',
    ]);
  });

  it('形の違う応答は失敗にし、HTTP の失敗は status を持つエラーにする', async () => {
    stubFetch(json({ lists: [] }));
    await expect(fetchBlueskyActorFeeds('a.bsky.social')).rejects.toThrow('Unexpected actor feeds response');
    stubFetch(json({ feeds: [] }));
    await expect(fetchBlueskyActorLists('a.bsky.social')).rejects.toThrow('Unexpected actor lists response');
    stubFetch(json({ error: 'Profile not found' }, 404));

    expect(await failure(fetchBlueskyActorFeeds('a.bsky.social'))).toMatchObject({ status: 404 });
  });
});

describe('追加した失敗の文言', () => {
  it('開く失敗を、ログイン失敗、連携の無効、見つからない、それ以外で分ける', async () => {
    stubFetch(json({ error: 'Bluesky login failed' }, 502));
    const login = await failure(fetchBlueskyFeedInfo(FEED));
    stubFetch(json({ error: 'Bluesky timeline is disabled' }, 409));
    const disabled = await failure(fetchBlueskyFeedInfo(FEED));
    stubFetch(json({ error: 'Feed not found' }, 404));
    const missing = await failure(fetchBlueskyFeedInfo(FEED));
    stubFetch(json({ error: 'Validation failed: url' }, 400));
    const invalid = await failure(resolveBlueskyFeedUrl('x'));
    stubFetch(json({ error: 'Bluesky request failed' }, 502));
    const other = await failure(fetchBlueskyFeedInfo(FEED));

    expect(blueskyFeedInfoFailureMessage(login)).toBe(
      'Bluesky にログインできないため、フィードやリストを開けませんでした',
    );
    expect(blueskyFeedInfoFailureMessage(disabled)).toBe('Bluesky 連携が無効です');
    expect(blueskyFeedInfoFailureMessage(missing)).toBe('このフィードやリストは見つかりません');
    expect(blueskyFeedInfoFailureMessage(other)).toBe('フィードやリストを開けませんでした');
    expect(blueskyFeedInfoFailureMessage(new Error('x'))).toBe('フィードやリストを開けませんでした');
    expect(blueskyFeedUrlFailureMessage(invalid)).toBe('bsky.app のフィードかリストの URL を入力してください');
    expect(blueskyFeedUrlFailureMessage(missing)).toBe('このフィードやリストは見つかりません');
    expect(blueskyFeedUrlFailureMessage(other)).toBe('フィードやリストを開けませんでした');
  });

  it('メンバーの読み込み失敗を、ログイン失敗、連携の無効、それ以外で分け、最初と続きで文言を変える', async () => {
    stubFetch(json({ error: 'Bluesky login failed' }, 502));
    const login = await failure(fetchBlueskyListMembers(LIST));
    stubFetch(json({ error: 'Bluesky timeline is disabled' }, 409));
    const disabled = await failure(fetchBlueskyListMembers(LIST));
    stubFetch(json({ error: 'Bluesky request failed' }, 502));
    const other = await failure(fetchBlueskyListMembers(LIST));

    expect(blueskyListMembersFailureMessage(login, 'first')).toBe(
      'Bluesky にログインできないため、メンバーを読み込めませんでした',
    );
    expect(blueskyListMembersFailureMessage(login, 'more')).toBe(
      'Bluesky にログインできないため、続きを読み込めませんでした',
    );
    expect(blueskyListMembersFailureMessage(disabled, 'first')).toBe('Bluesky 連携が無効です');
    expect(blueskyListMembersFailureMessage(other, 'first')).toBe('メンバーを読み込めませんでした');
    expect(blueskyListMembersFailureMessage(other, 'more')).toBe('続きを読み込めませんでした');
  });

  it('プロフィールのフィードとリストの読み込み失敗を、種類ごとの文言にする', async () => {
    stubFetch(json({ error: 'Bluesky login failed' }, 502));
    const login = await failure(fetchBlueskyActorFeeds('a.bsky.social'));
    stubFetch(json({ error: 'Bluesky timeline is disabled' }, 409));
    const disabled = await failure(fetchBlueskyActorLists('a.bsky.social'));

    expect(blueskyActorFeedsFailureMessage(login, 'first')).toBe(
      'Bluesky にログインできないため、フィードを読み込めませんでした',
    );
    expect(blueskyActorListsFailureMessage(login, 'first')).toBe(
      'Bluesky にログインできないため、リストを読み込めませんでした',
    );
    expect(blueskyActorListsFailureMessage(login, 'more')).toBe(
      'Bluesky にログインできないため、続きを読み込めませんでした',
    );
    expect(blueskyActorFeedsFailureMessage(disabled, 'first')).toBe('Bluesky 連携が無効です');
    expect(blueskyActorFeedsFailureMessage(new Error('x'), 'first')).toBe('フィードを読み込めませんでした');
    expect(blueskyActorListsFailureMessage(new Error('x'), 'first')).toBe('リストを読み込めませんでした');
    expect(blueskyActorListsFailureMessage(new Error('x'), 'more')).toBe('続きを読み込めませんでした');
  });
});
