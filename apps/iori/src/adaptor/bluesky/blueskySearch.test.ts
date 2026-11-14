import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { createBlueskySearch } from './blueskySearch.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 8));
const clientReturning = (response: ReturnType<BlueskyQueryClient['query']>) => {
  const query = vi.fn(() => response);
  return { query, search: createBlueskySearch({ client: { query }, now: () => NOW }) };
};

const postView = (n: number, extra: Record<string, unknown> = {}) => ({
  uri: `at://did:plc:a/app.bsky.feed.post/${n}`,
  cid: `cid${n}`,
  author: { did: 'did:plc:a', handle: 'alice.bsky.social', displayName: 'Alice' },
  record: {
    $type: 'app.bsky.feed.post',
    text: `post ${n}`,
    createdAt: '2026-11-08T00:00:00.000Z',
    reply: { parent: { uri: 'at://did:plc:b/app.bsky.feed.post/9', cid: 'cid9' } },
  },
  indexedAt: '2026-11-08T00:00:01.000Z',
  ...extra,
});

describe('createBlueskySearch', () => {
  describe('searchPosts', () => {
    it('posts を表示用の項目にし、viewer の like と repost を反映し、次の cursor を返す', async () => {
      const { search } = clientReturning(RA.ok({
        cursor: 'next',
        posts: [
          postView(1, {
            viewer: {
              like: 'at://did:plc:me/app.bsky.feed.like/3k1',
              repost: 'at://did:plc:me/app.bsky.feed.repost/3k2',
            },
          }),
          postView(2),
        ],
      }));

      const result = await search.searchPosts({ q: 'x', limit: 25 });

      expect(result).toMatchObject({ ok: true, val: { cursor: 'next' } });
      const items = result.ok ? result.val.items : [];
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        feedItemId: 'at://did:plc:a/app.bsky.feed.post/1',
        uri: 'at://did:plc:a/app.bsky.feed.post/1',
        cid: 'cid1',
        authorHandle: 'alice.bsky.social',
        authorDisplayName: 'Alice',
        text: 'post 1',
        replyParentUri: 'at://did:plc:b/app.bsky.feed.post/9',
        repostedByDid: null,
        repostedByHandle: null,
        fetchedAt: NOW,
        liked: true,
        viewerLikeUri: 'at://did:plc:me/app.bsky.feed.like/3k1',
        reposted: true,
        viewerRepostUri: 'at://did:plc:me/app.bsky.feed.repost/3k2',
      });
      expect(items[1]).toMatchObject({ liked: false, reposted: false, viewerLikeUri: null, viewerRepostUri: null });
    });

    it('形が違う要素を捨て、cursor が無ければ undefined にする', async () => {
      const { search } = clientReturning(RA.ok({
        posts: [postView(1), { uri: 'at://x' }, 'broken', postView(2, { indexedAt: 'not a date' }), postView(3)],
      }));

      const result = await search.searchPosts({ q: 'x', limit: 25 });

      expect(result.ok && result.val.items.map((item) => item.uri)).toEqual([
        'at://did:plc:a/app.bsky.feed.post/1',
        'at://did:plc:a/app.bsky.feed.post/3',
      ]);
      expect(result.ok && result.val.cursor).toBeUndefined();
    });

    it('クライアントのエラーをそのまま返す', async () => {
      const err = { type: 'BlueskyClientError', kind: 'http', message: 'x failed: status 500', status: 500 } as const;
      const { search } = clientReturning(RA.err(err));

      expect(await search.searchPosts({ q: 'x', limit: 25 })).toEqual({ ok: false, err });
    });

    it('posts が無い応答を invalid_response にする', async () => {
      const { search } = clientReturning(RA.ok({ cursor: 'x' }));

      expect(await search.searchPosts({ q: 'x', limit: 25 })).toMatchObject({
        ok: false,
        err: { kind: 'invalid_response' },
      });
    });
  });

  describe('searchActors', () => {
    it('actors を変換し、空の文字列と http(s) 以外の avatar を null にし、following の有無を followedByMe にする', async () => {
      const { search } = clientReturning(RA.ok({
        cursor: 'next',
        actors: [
          {
            did: 'did:plc:a',
            handle: 'alice.bsky.social',
            displayName: 'Alice',
            avatar: 'https://cdn.example/a.jpg',
            description: 'hi',
            viewer: { following: 'at://did:plc:me/app.bsky.graph.follow/3k1' },
          },
          { did: 'did:plc:b', handle: 'bob.bsky.social', displayName: '', avatar: 'javascript:alert(1)' },
        ],
      }));

      const result = await search.searchActors({ q: 'x', limit: 25 });

      expect(result).toEqual({
        ok: true,
        val: {
          cursor: 'next',
          actors: [
            {
              did: 'did:plc:a',
              handle: 'alice.bsky.social',
              displayName: 'Alice',
              avatar: 'https://cdn.example/a.jpg',
              description: 'hi',
              followedByMe: true,
            },
            {
              did: 'did:plc:b',
              handle: 'bob.bsky.social',
              displayName: null,
              avatar: null,
              description: null,
              followedByMe: false,
            },
          ],
        },
      });
    });

    it('形が違う要素を捨て、cursor が無ければ undefined にする', async () => {
      const { search } = clientReturning(RA.ok({
        actors: [{ did: 'did:plc:a', handle: 'alice.bsky.social' }, { handle: 'no-did' }, 42],
      }));

      const result = await search.searchActors({ q: 'x', limit: 25 });

      expect(result.ok && result.val.actors.map((actor) => actor.did)).toEqual(['did:plc:a']);
      expect(result.ok && result.val.cursor).toBeUndefined();
    });

    it('クライアントのエラーをそのまま返す', async () => {
      const err = { type: 'BlueskyClientError', kind: 'network', message: 'x failed' } as const;
      const { search } = clientReturning(RA.err(err));

      expect(await search.searchActors({ q: 'x', limit: 25 })).toEqual({ ok: false, err });
    });

    it('actors が無い応答を invalid_response にする', async () => {
      const { search } = clientReturning(RA.ok({ cursor: 'x' }));

      expect(await search.searchActors({ q: 'x', limit: 25 })).toMatchObject({
        ok: false,
        err: { kind: 'invalid_response' },
      });
    });
  });
});
