import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyClientError } from '../../ports/blueskyClient.ts';
import { type BlueskyFeedReader, isBlueskyFeedNotFound } from '../../ports/blueskyFeedReader.ts';
import { ListBlueskyActorFeedsUseCase } from '../listBlueskyActorFeeds.ts';
import { ListBlueskyActorListsUseCase } from '../listBlueskyActorLists.ts';
import { ResolveBlueskyFeedUrlUseCase } from '../resolveBlueskyFeedUrl.ts';

const FEED = 'at://did:plc:gen/app.bsky.feed.generator/a';
const LIST = 'at://did:plc:own/app.bsky.graph.list/b';
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'getFeed failed: status 500',
  status: 500,
};

const notFound: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'not found',
  status: 400,
  code: 'InvalidRequest',
};

describe('isBlueskyFeedNotFound', () => {
  const errorOf = (status: number, code: string): BlueskyClientError => ({ ...failure, status, code });

  it('cursor なしの InvalidRequest は見つからない失敗にし、cursor ありの InvalidRequest は通常の失敗にする', () => {
    expect(isBlueskyFeedNotFound(errorOf(400, 'InvalidRequest'), undefined)).toBe(true);
    expect(isBlueskyFeedNotFound(errorOf(400, 'InvalidRequest'), 'abc')).toBe(false);
  });

  it('UnknownFeed、UnknownList、NotFound と 404 は cursor の有無にかかわらず見つからない失敗にする', () => {
    for (const cursor of [undefined, 'abc']) {
      expect(isBlueskyFeedNotFound(errorOf(400, 'UnknownFeed'), cursor)).toBe(true);
      expect(isBlueskyFeedNotFound(errorOf(400, 'UnknownList'), cursor)).toBe(true);
      expect(isBlueskyFeedNotFound(errorOf(400, 'NotFound'), cursor)).toBe(true);
      expect(isBlueskyFeedNotFound({ ...failure, status: 404 }, cursor)).toBe(true);
    }
  });
});

describe('ListBlueskyActorFeedsUseCase と ListBlueskyActorListsUseCase', () => {
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
