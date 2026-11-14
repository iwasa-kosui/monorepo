import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { createBlueskyViewerRepostResolver } from './blueskyViewerRepostResolver.ts';

const POST = 'at://did:plc:a/app.bsky.feed.post/1';
const REPOST = 'at://did:plc:me/app.bsky.feed.repost/3kold';
const clientReturning = (response: ReturnType<BlueskyQueryClient['query']>) => {
  const query = vi.fn(() => response);
  return { query, resolver: createBlueskyViewerRepostResolver({ client: { query } }) };
};

describe('createBlueskyViewerRepostResolver', () => {
  it('viewer.repost が repost の uri なら、その uri を返す', async () => {
    const { resolver } = clientReturning(RA.ok({ posts: [{ uri: POST, cid: 'c', viewer: { repost: REPOST } }] }));

    expect(await resolver.resolve(POST)).toEqual({ ok: true, val: REPOST });
  });

  it('viewer が無い、または viewer.repost が無ければ null を返す', async () => {
    const withoutViewer = clientReturning(RA.ok({ posts: [{ uri: POST }] }));
    const withoutRepost = clientReturning(RA.ok({ posts: [{ uri: POST, viewer: { like: 'at://x/y/z' } }] }));

    expect(await withoutViewer.resolver.resolve(POST)).toEqual({ ok: true, val: null });
    expect(await withoutRepost.resolver.resolve(POST)).toEqual({ ok: true, val: null });
  });

  it('投稿が返らなければ null を返す', async () => {
    const empty = clientReturning(RA.ok({ posts: [] }));
    const other = clientReturning(
      RA.ok({ posts: [{ uri: 'at://did:plc:a/app.bsky.feed.post/2', viewer: { repost: REPOST } }] }),
    );

    expect(await empty.resolver.resolve(POST)).toEqual({ ok: true, val: null });
    expect(await other.resolver.resolve(POST)).toEqual({ ok: true, val: null });
  });

  it('viewer.repost が repost の uri の形でなければ null を返す', async () => {
    const { resolver } = clientReturning(
      RA.ok({ posts: [{ uri: POST, viewer: { repost: 'at://did:plc:me/app.bsky.feed.like/3k' } }] }),
    );

    expect(await resolver.resolve(POST)).toEqual({ ok: true, val: null });
  });

  it('posts が無い応答を invalid_response にする', async () => {
    const { resolver } = clientReturning(RA.ok({ cursor: 'x' }));

    expect(await resolver.resolve(POST)).toEqual({
      ok: false,
      err: {
        type: 'BlueskyClientError',
        kind: 'invalid_response',
        message: 'getPosts returned an unexpected response',
      },
    });
  });
});
