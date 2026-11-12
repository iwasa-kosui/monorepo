import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClientError, BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { createBlueskyFeedReader } from './blueskyFeedReader.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 12));
const DID = 'did:plc:alice';
const FEED_A = 'at://did:plc:gen/app.bsky.feed.generator/a';
const FEED_B = 'at://did:plc:gen/app.bsky.feed.generator/b';
const LIST_A = 'at://did:plc:own/app.bsky.graph.list/la';
const LIST_B = 'at://did:plc:own/app.bsky.graph.list/lb';
const PREF_V2 = 'app.bsky.actor.defs#savedFeedsPrefV2';
const PREF_V1 = 'app.bsky.actor.defs#savedFeedsPref';
const networkError: BlueskyClientError = { type: 'BlueskyClientError', kind: 'network', message: 'x' };

type Query = BlueskyQueryClient['query'];

const postView = {
  post: {
    uri: `at://${DID}/app.bsky.feed.post/1`,
    cid: 'bafycid',
    author: { did: DID, handle: 'alice.bsky.social' },
    record: { $type: 'app.bsky.feed.post', text: 'hi', createdAt: '2026-11-08T01:00:00.000Z' },
    indexedAt: '2026-11-08T01:00:05.000Z',
  },
};

const readerWith = (query: Query) => {
  const fn = vi.fn<Query>(query);
  return { query: fn, reader: createBlueskyFeedReader({ client: { query: fn }, now: () => NOW }) };
};

const generator = (uri: string, overrides: Record<string, unknown> = {}) => ({
  uri,
  displayName: `name ${uri.slice(-1)}`,
  avatar: 'https://cdn.example/g.jpg',
  description: 'about',
  creator: { did: 'did:plc:gen', handle: 'gen.bsky.social' },
  ...overrides,
});

const prefsV2 = (items: readonly Record<string, unknown>[]) => ({
  preferences: [{ $type: 'app.bsky.actor.defs#adultContentPref', enabled: false }, { $type: PREF_V2, items }],
});

const savedFeedsQuery = (
  preferences: Record<string, unknown>,
  overrides: { feeds?: Query; list?: Query } = {},
): Query =>
async (nsid, params) => {
  if (nsid === 'app.bsky.actor.getPreferences') return RA.ok(preferences);
  if (nsid === 'app.bsky.feed.getFeedGenerators') {
    return overrides.feeds?.(nsid, params)
      ?? RA.ok({ feeds: ([] as readonly string[]).concat(params.feeds ?? []).map((uri) => generator(uri)) });
  }
  if (nsid === 'app.bsky.graph.getList') {
    return overrides.list?.(nsid, params) ?? RA.ok({
      list: {
        uri: params.list,
        name: `list ${String(params.list).slice(-1)}`,
        avatar: 'https://cdn.example/l.jpg',
        description: 'list about',
        purpose: 'app.bsky.graph.defs#curatelist',
        creator: { did: 'did:plc:own', handle: 'own.bsky.social' },
      },
      items: [],
    });
  }
  return RA.err(networkError);
};

describe('createBlueskyFeedReader.listSavedFeeds', () => {
  it('savedFeedsPrefV2 の feed と list を、ピン留めを先にして preferences の順で返し、timeline は除く', async () => {
    const { reader } = readerWith(savedFeedsQuery(prefsV2([
      { id: '1', type: 'timeline', value: 'following', pinned: true },
      { id: '2', type: 'feed', value: FEED_A, pinned: false },
      { id: '3', type: 'list', value: LIST_A, pinned: true },
      { id: '4', type: 'feed', value: FEED_B, pinned: true },
      { id: '5', type: 'list', value: LIST_B, pinned: false },
    ])));

    const result = await reader.listSavedFeeds();

    expect(result).toEqual({
      ok: true,
      val: {
        feeds: [
          {
            uri: LIST_A,
            kind: 'list',
            pinned: true,
            displayName: 'list a',
            avatar: 'https://cdn.example/l.jpg',
            description: 'list about',
            creatorHandle: 'own.bsky.social',
          },
          {
            uri: FEED_B,
            kind: 'feed',
            pinned: true,
            displayName: 'name b',
            avatar: 'https://cdn.example/g.jpg',
            description: 'about',
            creatorHandle: 'gen.bsky.social',
          },
          {
            uri: FEED_A,
            kind: 'feed',
            pinned: false,
            displayName: 'name a',
            avatar: 'https://cdn.example/g.jpg',
            description: 'about',
            creatorHandle: 'gen.bsky.social',
          },
          {
            uri: LIST_B,
            kind: 'list',
            pinned: false,
            displayName: 'list b',
            avatar: 'https://cdn.example/l.jpg',
            description: 'list about',
            creatorHandle: 'own.bsky.social',
          },
        ],
      },
    });
  });

  it('feed のメタデータは getFeedGenerators に feeds を配列で渡し、list は getList を limit 1 で呼ぶ', async () => {
    const { reader, query } = readerWith(savedFeedsQuery(prefsV2([
      { id: '1', type: 'feed', value: FEED_A, pinned: false },
      { id: '2', type: 'feed', value: FEED_B, pinned: false },
      { id: '3', type: 'list', value: LIST_A, pinned: false },
    ])));

    await reader.listSavedFeeds();

    expect(query).toHaveBeenCalledWith('app.bsky.actor.getPreferences', {});
    expect(query).toHaveBeenCalledWith('app.bsky.feed.getFeedGenerators', { feeds: [FEED_A, FEED_B] });
    expect(query).toHaveBeenCalledWith('app.bsky.graph.getList', { list: LIST_A, limit: '1' });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('feed が 25 件を超えるときは 25 件ずつ getFeedGenerators を呼ぶ', async () => {
    const uris = Array.from({ length: 30 }, (_, index) => `at://did:plc:gen/app.bsky.feed.generator/g${index}`);
    const { reader, query } = readerWith(savedFeedsQuery(prefsV2(
      uris.map((value, index) => ({ id: String(index), type: 'feed', value, pinned: false })),
    )));

    const result = await reader.listSavedFeeds();

    const calls = query.mock.calls.filter(([nsid]) => nsid === 'app.bsky.feed.getFeedGenerators');
    expect(calls.map(([, params]) => params.feeds)).toEqual([uris.slice(0, 25), uris.slice(25)]);
    expect(result.ok && result.val.feeds.map(({ uri }) => uri)).toEqual(uris);
  });

  it('メタデータの取得に失敗した項目と応答に無い項目は、落とさず displayName を付けずに返す', async () => {
    const { reader } = readerWith(savedFeedsQuery(
      prefsV2([
        { id: '1', type: 'feed', value: FEED_A, pinned: false },
        { id: '2', type: 'feed', value: FEED_B, pinned: false },
        { id: '3', type: 'list', value: LIST_A, pinned: false },
        { id: '4', type: 'list', value: LIST_B, pinned: false },
      ]),
      {
        feeds: async () => RA.ok({ feeds: [generator(FEED_A)] }),
        list: async (_nsid, params) =>
          params.list === LIST_A ? RA.err(networkError) : RA.ok({ list: { name: 'list b' } }),
      },
    ));

    const result = await reader.listSavedFeeds();

    expect(result).toEqual({
      ok: true,
      val: {
        feeds: [
          expect.objectContaining({ uri: FEED_A, displayName: 'name a' }),
          { uri: FEED_B, kind: 'feed', pinned: false },
          { uri: LIST_A, kind: 'list', pinned: false },
          expect.objectContaining({ uri: LIST_B, displayName: 'list b' }),
        ],
      },
    });
    expect(result.ok && result.val.feeds[1]?.displayName).toBeUndefined();
    expect(result.ok && result.val.feeds[2]?.displayName).toBeUndefined();
  });

  it('getFeedGenerators の呼び出し全体が失敗しても、feed の項目は displayName なしで返す', async () => {
    const { reader } = readerWith(savedFeedsQuery(
      prefsV2([{ id: '1', type: 'feed', value: FEED_A, pinned: true }]),
      { feeds: async () => RA.err(networkError) },
    ));

    const result = await reader.listSavedFeeds();

    expect(result).toEqual({ ok: true, val: { feeds: [{ uri: FEED_A, kind: 'feed', pinned: true }] } });
  });

  it('V2 が無ければ旧 savedFeedsPref から、URI の collection で feed と list を判定して作る', async () => {
    const { reader } = readerWith(savedFeedsQuery({
      preferences: [{
        $type: PREF_V1,
        pinned: [LIST_A],
        saved: [FEED_A, LIST_A, 'at://did:plc:gen/app.bsky.feed.post/p', FEED_B],
      }],
    }));

    const result = await reader.listSavedFeeds();

    expect(result.ok && result.val.feeds.map(({ uri, kind, pinned }) => ({ uri, kind, pinned }))).toEqual([
      { uri: LIST_A, kind: 'list', pinned: true },
      { uri: FEED_A, kind: 'feed', pinned: false },
      { uri: FEED_B, kind: 'feed', pinned: false },
    ]);
  });

  it('V2 があるときは旧 savedFeedsPref を使わない', async () => {
    const { reader } = readerWith(savedFeedsQuery({
      preferences: [
        { $type: PREF_V1, pinned: [], saved: [FEED_B] },
        { $type: PREF_V2, items: [{ id: '1', type: 'feed', value: FEED_A, pinned: false }] },
      ],
    }));

    const result = await reader.listSavedFeeds();

    expect(result.ok && result.val.feeds.map(({ uri }) => uri)).toEqual([FEED_A]);
  });

  it('保存したものが無い、または URI が不正な項目だけなら空の一覧を返し、メタデータを取りに行かない', async () => {
    const empty = readerWith(savedFeedsQuery({ preferences: [] }));
    const invalid = readerWith(savedFeedsQuery(prefsV2([
      { id: '1', type: 'feed', value: 'not-a-uri', pinned: false },
      { id: '2', type: 'list', value: FEED_A, pinned: false },
      { id: '3', type: 'feed' },
    ])));

    expect(await empty.reader.listSavedFeeds()).toEqual({ ok: true, val: { feeds: [] } });
    expect(await invalid.reader.listSavedFeeds()).toEqual({ ok: true, val: { feeds: [] } });
    expect(empty.query).toHaveBeenCalledExactlyOnceWith('app.bsky.actor.getPreferences', {});
    expect(invalid.query).toHaveBeenCalledExactlyOnceWith('app.bsky.actor.getPreferences', {});
  });

  it('同じ URI の重複は先のものだけを残す', async () => {
    const { reader } = readerWith(savedFeedsQuery(prefsV2([
      { id: '1', type: 'feed', value: FEED_A, pinned: false },
      { id: '2', type: 'feed', value: FEED_A, pinned: true },
    ])));

    const result = await reader.listSavedFeeds();

    expect(result.ok && result.val.feeds).toEqual([expect.objectContaining({ uri: FEED_A, pinned: false })]);
  });

  it('getPreferences の失敗はエラーで返し、読めない応答は invalid_response にする', async () => {
    const failing = readerWith(async () => RA.err(networkError));
    const invalid = readerWith(async () => RA.ok({ preferences: 'x' }));

    expect(await failing.reader.listSavedFeeds()).toEqual({ ok: false, err: networkError });
    expect(await invalid.reader.listSavedFeeds()).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
  });
});

describe('createBlueskyFeedReader.getFeedPosts', () => {
  it('feed の URI は getFeed を feed と limit 30 で呼び、cursor は指定があるときだけ付ける', async () => {
    const first = readerWith(async () => RA.ok({ feed: [] }));
    const next = readerWith(async () => RA.ok({ feed: [] }));

    await first.reader.getFeedPosts({ uri: FEED_A, cursor: undefined });
    await next.reader.getFeedPosts({ uri: FEED_A, cursor: 'abc' });

    expect(first.query).toHaveBeenCalledExactlyOnceWith('app.bsky.feed.getFeed', { feed: FEED_A, limit: '30' });
    expect(next.query).toHaveBeenCalledExactlyOnceWith('app.bsky.feed.getFeed', {
      feed: FEED_A,
      limit: '30',
      cursor: 'abc',
    });
  });

  it('list の URI は getListFeed を list と limit 30 で呼ぶ', async () => {
    const { reader, query } = readerWith(async () => RA.ok({ feed: [] }));

    await reader.getFeedPosts({ uri: LIST_A, cursor: 'abc' });

    expect(query).toHaveBeenCalledExactlyOnceWith('app.bsky.feed.getListFeed', {
      list: LIST_A,
      limit: '30',
      cursor: 'abc',
    });
  });

  it('投稿とカーソルを返し、続きが無ければ cursor を undefined にする', async () => {
    const withCursor = readerWith(async () => RA.ok({ feed: [postView], cursor: 'next' }));
    const last = readerWith(async () => RA.ok({ feed: [postView] }));

    const page = await withCursor.reader.getFeedPosts({ uri: FEED_A, cursor: undefined });
    const end = await last.reader.getFeedPosts({ uri: FEED_A, cursor: undefined });

    expect(page.ok && page.val.cursor).toBe('next');
    expect(page.ok && page.val.items).toHaveLength(1);
    expect(page.ok && page.val.items[0]).toMatchObject({ uri: postView.post.uri, authorDid: DID, fetchedAt: NOW });
    expect(end.ok && end.val.cursor).toBeUndefined();
  });

  it('feed でも list でもない URI は、Bluesky を呼ばずに invalid_response にする', async () => {
    const { reader, query } = readerWith(async () => RA.ok({ feed: [] }));

    const result = await reader.getFeedPosts({ uri: 'at://did:plc:alice/app.bsky.feed.post/1', cursor: undefined });

    expect(result).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
    expect(query).not.toHaveBeenCalled();
  });

  it('読めない応答を invalid_response にし、クエリの失敗はそのまま返す', async () => {
    const invalid = readerWith(async () => RA.ok({ posts: [] }));
    const failing = readerWith(async () => RA.err(networkError));

    expect(await invalid.reader.getFeedPosts({ uri: FEED_A, cursor: undefined })).toMatchObject({
      ok: false,
      err: { kind: 'invalid_response' },
    });
    expect(await failing.reader.getFeedPosts({ uri: FEED_A, cursor: undefined })).toEqual({
      ok: false,
      err: networkError,
    });
  });
});
