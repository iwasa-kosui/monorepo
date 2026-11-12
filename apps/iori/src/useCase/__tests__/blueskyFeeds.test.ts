import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyClientError } from '../../ports/blueskyClient.ts';
import type { BlueskyFeedReader } from '../../ports/blueskyFeedReader.ts';
import { GetBlueskyFeedInfoUseCase } from '../getBlueskyFeedInfo.ts';
import { ListBlueskyActorFeedsUseCase } from '../listBlueskyActorFeeds.ts';
import { ListBlueskyActorListsUseCase } from '../listBlueskyActorLists.ts';
import { ListBlueskyFeedPostsUseCase } from '../listBlueskyFeedPosts.ts';
import { ListBlueskyListMembersUseCase } from '../listBlueskyListMembers.ts';
import { ListBlueskySavedFeedsUseCase } from '../listBlueskySavedFeeds.ts';
import { ResolveBlueskyFeedUrlUseCase } from '../resolveBlueskyFeedUrl.ts';

const FEED = 'at://did:plc:gen/app.bsky.feed.generator/a';
const LIST = 'at://did:plc:own/app.bsky.graph.list/b';
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'getFeed failed: status 500',
  status: 500,
};

describe('ListBlueskySavedFeedsUseCase', () => {
  it('保存したフィードとリストを返す', async () => {
    const saved = { feeds: [{ uri: FEED, kind: 'feed', pinned: true, displayName: 'Hot' }] } as const;
    const listSavedFeeds = vi.fn<BlueskyFeedReader['listSavedFeeds']>(async () => RA.ok(saved));

    const result = await ListBlueskySavedFeedsUseCase.create({ reader: { listSavedFeeds } }).run();

    expect(result).toEqual({ ok: true, val: saved });
    expect(listSavedFeeds).toHaveBeenCalledOnce();
  });

  it('reader の失敗をそのまま返す', async () => {
    const useCase = ListBlueskySavedFeedsUseCase.create({ reader: { listSavedFeeds: async () => RA.err(failure) } });

    expect(await useCase.run()).toEqual({ ok: false, err: failure });
  });
});

describe('ListBlueskyFeedPostsUseCase', () => {
  it('uri と cursor を渡して投稿とカーソルを返す', async () => {
    const page = { items: [], cursor: 'next' };
    const getFeedPosts = vi.fn<BlueskyFeedReader['getFeedPosts']>(async () => RA.ok(page));

    const result = await ListBlueskyFeedPostsUseCase.create({ reader: { getFeedPosts } }).run({
      uri: FEED,
      cursor: 'abc',
    });

    expect(result).toEqual({ ok: true, val: page });
    expect(getFeedPosts).toHaveBeenCalledExactlyOnceWith({ uri: FEED, cursor: 'abc' });
  });

  it('reader の失敗をそのまま返す', async () => {
    const useCase = ListBlueskyFeedPostsUseCase.create({ reader: { getFeedPosts: async () => RA.err(failure) } });

    expect(await useCase.run({ uri: FEED, cursor: undefined })).toEqual({ ok: false, err: failure });
  });
});

const notFound: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'not found',
  status: 400,
  code: 'InvalidRequest',
};

describe('GetBlueskyFeedInfoUseCase', () => {
  it('uri を渡して一覧の項目を返す', async () => {
    const info = { uri: FEED, kind: 'feed', pinned: false, displayName: 'Hot' } as const;
    const getFeedInfo = vi.fn<BlueskyFeedReader['getFeedInfo']>(async () => RA.ok(info));

    const result = await GetBlueskyFeedInfoUseCase.create({ reader: { getFeedInfo } }).run({ uri: FEED });

    expect(result).toEqual({ ok: true, val: info });
    expect(getFeedInfo).toHaveBeenCalledExactlyOnceWith(FEED);
  });

  it('見つからない失敗は BlueskyFeedNotFound にし、それ以外はそのまま返す', async () => {
    const missing = GetBlueskyFeedInfoUseCase.create({ reader: { getFeedInfo: async () => RA.err(notFound) } });
    const failing = GetBlueskyFeedInfoUseCase.create({ reader: { getFeedInfo: async () => RA.err(failure) } });

    expect(await missing.run({ uri: FEED })).toEqual({ ok: false, err: { type: 'BlueskyFeedNotFound' } });
    expect(await failing.run({ uri: FEED })).toEqual({ ok: false, err: failure });
  });
});

describe('ListBlueskyListMembersUseCase', () => {
  it('uri と cursor を渡してメンバーとカーソルを返す', async () => {
    const page = { actors: [], cursor: 'next' };
    const getListMembers = vi.fn<BlueskyFeedReader['getListMembers']>(async () => RA.ok(page));

    const result = await ListBlueskyListMembersUseCase.create({ reader: { getListMembers } }).run({
      uri: LIST,
      cursor: 'abc',
    });

    expect(result).toEqual({ ok: true, val: page });
    expect(getListMembers).toHaveBeenCalledExactlyOnceWith({ uri: LIST, cursor: 'abc' });
  });

  it('見つからない失敗は BlueskyFeedNotFound にし、それ以外はそのまま返す', async () => {
    const missing = ListBlueskyListMembersUseCase.create({
      reader: { getListMembers: async () => RA.err(notFound) },
    });
    const failing = ListBlueskyListMembersUseCase.create({
      reader: { getListMembers: async () => RA.err(failure) },
    });

    expect(await missing.run({ uri: LIST, cursor: undefined })).toEqual({
      ok: false,
      err: { type: 'BlueskyFeedNotFound' },
    });
    expect(await failing.run({ uri: LIST, cursor: undefined })).toEqual({ ok: false, err: failure });
  });
});

describe('ListBlueskyActorFeedsUseCase と ListBlueskyActorListsUseCase', () => {
  const page = { feeds: [{ uri: FEED, kind: 'feed', pinned: false }], cursor: 'next' } as const;

  it('actor と cursor を渡して一覧とカーソルを返す', async () => {
    const getActorFeeds = vi.fn<BlueskyFeedReader['getActorFeeds']>(async () => RA.ok(page));
    const getActorLists = vi.fn<BlueskyFeedReader['getActorLists']>(async () => RA.ok(page));

    const feeds = await ListBlueskyActorFeedsUseCase.create({ reader: { getActorFeeds } }).run({
      actor: 'did:plc:a',
      cursor: 'abc',
    });
    const lists = await ListBlueskyActorListsUseCase.create({ reader: { getActorLists } }).run({
      actor: 'did:plc:a',
      cursor: undefined,
    });

    expect(feeds).toEqual({ ok: true, val: page });
    expect(lists).toEqual({ ok: true, val: page });
    expect(getActorFeeds).toHaveBeenCalledExactlyOnceWith({ actor: 'did:plc:a', cursor: 'abc' });
    expect(getActorLists).toHaveBeenCalledExactlyOnceWith({ actor: 'did:plc:a', cursor: undefined });
  });

  it('アカウントが無い失敗は BlueskyProfileNotFound にし、それ以外はそのまま返す', async () => {
    const feeds = (err: BlueskyClientError) =>
      ListBlueskyActorFeedsUseCase.create({ reader: { getActorFeeds: async () => RA.err(err) } });
    const lists = (err: BlueskyClientError) =>
      ListBlueskyActorListsUseCase.create({ reader: { getActorLists: async () => RA.err(err) } });
    const input = { actor: 'did:plc:a', cursor: undefined };

    expect(await feeds(notFound).run(input)).toEqual({ ok: false, err: { type: 'BlueskyProfileNotFound' } });
    expect(await lists(notFound).run(input)).toEqual({ ok: false, err: { type: 'BlueskyProfileNotFound' } });
    expect(await feeds(failure).run(input)).toEqual({ ok: false, err: failure });
    expect(await lists(failure).run(input)).toEqual({ ok: false, err: failure });
  });
});

describe('ResolveBlueskyFeedUrlUseCase', () => {
  it('did の URL は Bluesky を呼ばずに at-uri にする', async () => {
    const resolveHandle = vi.fn<BlueskyFeedReader['resolveHandle']>(async () => RA.ok('did:plc:x'));
    const useCase = ResolveBlueskyFeedUrlUseCase.create({ reader: { resolveHandle } });

    expect(await useCase.run({ url: 'https://bsky.app/profile/did:plc:gen/feed/a' })).toEqual({
      ok: true,
      val: { uri: FEED },
    });
    expect(resolveHandle).not.toHaveBeenCalled();
  });

  it('ハンドルの URL は did に解決して at-uri にする', async () => {
    const resolveHandle = vi.fn<BlueskyFeedReader['resolveHandle']>(async () => RA.ok('did:plc:own'));
    const useCase = ResolveBlueskyFeedUrlUseCase.create({ reader: { resolveHandle } });

    expect(await useCase.run({ url: 'https://bsky.app/profile/own.bsky.social/lists/b' })).toEqual({
      ok: true,
      val: { uri: LIST },
    });
    expect(resolveHandle).toHaveBeenCalledExactlyOnceWith('own.bsky.social');
  });

  it('形の違う URL は BlueskyFeedUrlInvalid にし、Bluesky を呼ばない', async () => {
    const resolveHandle = vi.fn<BlueskyFeedReader['resolveHandle']>(async () => RA.ok('did:plc:x'));
    const useCase = ResolveBlueskyFeedUrlUseCase.create({ reader: { resolveHandle } });

    expect(await useCase.run({ url: 'https://example.com' })).toEqual({
      ok: false,
      err: { type: 'BlueskyFeedUrlInvalid' },
    });
    expect(resolveHandle).not.toHaveBeenCalled();
  });

  it('ハンドルを解決できない失敗は BlueskyFeedNotFound にし、それ以外はそのまま返す', async () => {
    const url = 'https://bsky.app/profile/own.bsky.social/feed/a';
    const missing = ResolveBlueskyFeedUrlUseCase.create({ reader: { resolveHandle: async () => RA.err(notFound) } });
    const failing = ResolveBlueskyFeedUrlUseCase.create({ reader: { resolveHandle: async () => RA.err(failure) } });

    expect(await missing.run({ url })).toEqual({ ok: false, err: { type: 'BlueskyFeedNotFound' } });
    expect(await failing.run({ url })).toEqual({ ok: false, err: failure });
  });
});
