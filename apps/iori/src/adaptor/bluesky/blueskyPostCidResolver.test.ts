import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyClientError, BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { createBlueskyPostCidResolver } from './blueskyPostCidResolver.ts';

const POST = 'at://did:plc:a/app.bsky.feed.post/1';
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'getPosts failed: status 500',
  status: 500,
};

const setup = (response: ReturnType<BlueskyQueryClient['query']>) => {
  const query = vi.fn<BlueskyQueryClient['query']>(() => response);
  return { query, resolver: createBlueskyPostCidResolver({ client: { query } }) };
};

describe('createBlueskyPostCidResolver', () => {
  it('getPosts に uri を渡し、同じ uri の投稿の cid を返す', async () => {
    const t = setup(RA.ok({ posts: [{ uri: 'at://other', cid: 'bafyother' }, { uri: POST, cid: 'bafypost' }] }));

    expect(await t.resolver.resolve(POST)).toEqual({ ok: true, val: 'bafypost' });
    expect(t.query).toHaveBeenCalledExactlyOnceWith('app.bsky.feed.getPosts', { uris: POST });
  });

  it('投稿が返らなければ undefined にする', async () => {
    const t = setup(RA.ok({ posts: [] }));

    expect(await t.resolver.resolve(POST)).toEqual({ ok: true, val: undefined });
  });

  it('応答の形が違えば invalid_response にする', async () => {
    const t = setup(RA.ok({ posts: [{ uri: POST }] }));

    expect(await t.resolver.resolve(POST)).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
  });

  it('getPosts の失敗をそのまま返す', async () => {
    const t = setup(RA.err(failure));

    expect(await t.resolver.resolve(POST)).toEqual({ ok: false, err: failure });
  });
});
