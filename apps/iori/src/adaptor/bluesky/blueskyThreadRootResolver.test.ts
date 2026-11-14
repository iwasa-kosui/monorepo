import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { createBlueskyThreadRootResolver } from './blueskyThreadRootResolver.ts';

const POST = 'at://did:plc:a/app.bsky.feed.post/1';
const ROOT = 'at://did:plc:b/app.bsky.feed.post/root';

const setup = (response: ReturnType<BlueskyQueryClient['query']>) => {
  const query = vi.fn<BlueskyQueryClient['query']>(() => response);
  return { query, resolver: createBlueskyThreadRootResolver({ client: { query } }) };
};

describe('createBlueskyThreadRootResolver', () => {
  it('返信でなければ、getPosts に uri を渡し、投稿自身の uri を返す', async () => {
    const t = setup(RA.ok({ posts: [{ uri: POST, cid: 'bafypost', record: { text: 'hi' } }] }));

    expect(await t.resolver.resolve(POST)).toEqual({ ok: true, val: POST });
    expect(t.query).toHaveBeenCalledExactlyOnceWith('app.bsky.feed.getPosts', { uris: POST });
  });

  it('返信なら、record.reply.root.uri を返す', async () => {
    const t = setup(RA.ok({
      posts: [{ uri: POST, cid: 'bafypost', record: { reply: { root: { uri: ROOT }, parent: { uri: ROOT } } } }],
    }));

    expect(await t.resolver.resolve(POST)).toEqual({ ok: true, val: ROOT });
  });

  it('同じ uri の投稿が無ければ undefined を返す', async () => {
    const t = setup(RA.ok({ posts: [{ uri: 'at://other', cid: 'bafyother' }] }));

    expect(await t.resolver.resolve(POST)).toEqual({ ok: true, val: undefined });
  });

  it('応答の形が不正なら invalid_response にする', async () => {
    const t = setup(RA.ok({ posts: 'nope' }));

    expect(await t.resolver.resolve(POST)).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
  });
});
