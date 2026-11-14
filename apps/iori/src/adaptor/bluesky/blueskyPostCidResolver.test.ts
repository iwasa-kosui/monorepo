import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { createBlueskyPostCidResolver } from './blueskyPostCidResolver.ts';

const POST = 'at://did:plc:a/app.bsky.feed.post/1';
const LIKE = 'at://did:plc:me/app.bsky.feed.like/3klike';
const REPOST = 'at://did:plc:me/app.bsky.feed.repost/3krepost';

const setup = (response: ReturnType<BlueskyQueryClient['query']>) => {
  const query = vi.fn<BlueskyQueryClient['query']>(() => response);
  return { query, resolver: createBlueskyPostCidResolver({ client: { query } }) };
};

describe('createBlueskyPostCidResolver', () => {
  it('getPosts に uri を渡し、同じ uri の投稿の cid を返す。viewer が無ければ likeUri と repostUri は null', async () => {
    const t = setup(RA.ok({ posts: [{ uri: 'at://other', cid: 'bafyother' }, { uri: POST, cid: 'bafypost' }] }));

    expect(await t.resolver.resolve(POST)).toEqual({
      ok: true,
      val: { cid: 'bafypost', likeUri: null, repostUri: null },
    });
    expect(t.query).toHaveBeenCalledExactlyOnceWith('app.bsky.feed.getPosts', { uris: POST });
  });

  it('viewer.like と viewer.repost を likeUri と repostUri として返す', async () => {
    const t = setup(RA.ok({ posts: [{ uri: POST, cid: 'bafypost', viewer: { like: LIKE, repost: REPOST } }] }));

    expect(await t.resolver.resolve(POST)).toEqual({
      ok: true,
      val: { cid: 'bafypost', likeUri: LIKE, repostUri: REPOST },
    });
  });

  it('viewer.like と viewer.repost の形が不正なら、それぞれ null にする', async () => {
    const t = setup(RA.ok({
      posts: [{
        uri: POST,
        cid: 'bafypost',
        viewer: { like: 'at://did:plc:me/app.bsky.feed.repost/3k', repost: 'at://did:plc:me/app.bsky.feed.like/3k' },
      }],
    }));

    expect(await t.resolver.resolve(POST)).toEqual({
      ok: true,
      val: { cid: 'bafypost', likeUri: null, repostUri: null },
    });
  });

  it('投稿が返らなければ undefined にする', async () => {
    const t = setup(RA.ok({ posts: [] }));

    expect(await t.resolver.resolve(POST)).toEqual({ ok: true, val: undefined });
  });

  it('応答の形が違えば invalid_response にする', async () => {
    const t = setup(RA.ok({ posts: [{ uri: POST }] }));

    expect(await t.resolver.resolve(POST)).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
  });
});
