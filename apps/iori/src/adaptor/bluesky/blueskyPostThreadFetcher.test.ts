import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { createBlueskyPostThreadFetcher } from './blueskyPostThreadFetcher.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 8));
const URI = 'at://did:plc:author/app.bsky.feed.post/3kabc';
const clientReturning = (response: ReturnType<BlueskyQueryClient['query']>) => {
  const query = vi.fn(() => response);
  return { query, fetcher: createBlueskyPostThreadFetcher({ client: { query }, now: () => NOW }) };
};
const threadResponse = {
  thread: {
    $type: 'app.bsky.feed.defs#threadViewPost',
    post: {
      uri: URI,
      cid: 'bafycid',
      author: { did: 'did:plc:author', handle: 'alice.bsky.social' },
      record: { $type: 'app.bsky.feed.post', text: 'hello', createdAt: '2026-11-08T01:00:00.000Z' },
      indexedAt: '2026-11-08T01:00:05.000Z',
    },
  },
};

describe('createBlueskyPostThreadFetcher', () => {
  it('getPostThread を uri・depth・parentHeight つきで呼び、変換したスレッドを返す', async () => {
    const { query, fetcher } = clientReturning(RA.ok(threadResponse));

    const result = await fetcher.fetch({ uri: URI });

    expect(query).toHaveBeenCalledWith('app.bsky.feed.getPostThread', { uri: URI, depth: '6', parentHeight: '40' });
    expect(result).toMatchObject({
      ok: true,
      val: { ancestors: [], replies: [], post: { uri: URI, fetchedAt: NOW } },
    });
  });

  it('クライアントのエラーをそのまま返す', async () => {
    const err = {
      type: 'BlueskyClientError',
      kind: 'http',
      message: 'getPostThread failed: status 400 NotFound',
      status: 400,
      code: 'NotFound',
    } as const;
    const { fetcher } = clientReturning(RA.err(err));

    expect(await fetcher.fetch({ uri: URI })).toEqual({ ok: false, err });
  });

  it('thread が見つからない、またはブロックされている応答を BlueskyPostThreadUnavailable にする', async () => {
    const notFound = clientReturning(RA.ok({
      thread: { $type: 'app.bsky.feed.defs#notFoundPost', uri: URI, notFound: true },
    }));
    const blocked = clientReturning(RA.ok({
      thread: { $type: 'app.bsky.feed.defs#blockedPost', uri: URI, blocked: true, author: { did: 'did:plc:author' } },
    }));

    expect(await notFound.fetcher.fetch({ uri: URI })).toEqual({
      ok: false,
      err: { type: 'BlueskyPostThreadUnavailable', reason: 'notFound' },
    });
    expect(await blocked.fetcher.fetch({ uri: URI })).toEqual({
      ok: false,
      err: { type: 'BlueskyPostThreadUnavailable', reason: 'blocked' },
    });
  });

  it('thread が無い応答を invalid_response にする', async () => {
    const { fetcher } = clientReturning(RA.ok({ cursor: 'x' }));

    expect(await fetcher.fetch({ uri: URI })).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
  });
});
