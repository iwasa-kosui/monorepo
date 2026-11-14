import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { createBlueskyProfileReader } from './blueskyProfileReader.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 12));
const DID = 'did:plc:alice';
const FOLLOW = 'at://did:plc:me/app.bsky.graph.follow/3kfollow';
const clientReturning = (response: ReturnType<BlueskyQueryClient['query']>) => {
  const query = vi.fn(() => response);
  return { query, reader: createBlueskyProfileReader({ client: { query }, now: () => NOW }) };
};
const postView = {
  post: {
    uri: `at://${DID}/app.bsky.feed.post/1`,
    cid: 'bafycid',
    author: { did: DID, handle: 'alice.bsky.social' },
    record: { $type: 'app.bsky.feed.post', text: 'hi', createdAt: '2026-11-08T01:00:00.000Z' },
    indexedAt: '2026-11-08T01:00:05.000Z',
  },
};

describe('createBlueskyProfileReader.getProfile', () => {
  it('数が無ければ 0、viewer が無ければ未フォローで、文字列が無ければ null にする', async () => {
    const { reader } = clientReturning(
      RA.ok({ did: DID, handle: 'alice.bsky.social', displayName: '', avatar: 'javascript:alert(1)' }),
    );

    expect(await reader.getProfile(DID)).toEqual({
      ok: true,
      val: {
        did: DID,
        handle: 'alice.bsky.social',
        displayName: null,
        description: null,
        avatar: null,
        banner: null,
        followersCount: 0,
        followsCount: 0,
        postsCount: 0,
        viewerFollowingUri: undefined,
        viewerFollowedBy: false,
      },
    });
  });

  it('did が無い応答を invalid_response にする', async () => {
    const { reader } = clientReturning(RA.ok({ handle: 'a.bsky.social' }));

    expect(await reader.getProfile(DID)).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
  });
});

describe('createBlueskyProfileReader.getAuthorFeed', () => {
  it('投稿とカーソルを返す', async () => {
    const { reader } = clientReturning(RA.ok({ feed: [postView], cursor: 'next' }));

    const result = await reader.getAuthorFeed({ actor: DID, cursor: undefined, filter: 'posts_and_author_threads' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.val.cursor).toBe('next');
    expect(result.val.unavailable).toBeNull();
    expect(result.val.items).toHaveLength(1);
    expect(result.val.items[0]).toMatchObject({ uri: postView.post.uri, authorDid: DID, fetchedAt: NOW });
  });

  it.each(['BlockedActor', 'BlockedByActor'])(
    '400 の %s はエラーにせず、空の投稿一覧と unavailable: blocked を返す',
    async (code) => {
      const { reader } = clientReturning(RA.err({
        type: 'BlueskyClientError',
        kind: 'http',
        message: `getAuthorFeed failed: status 400 ${code}`,
        status: 400,
        code,
      }));

      expect(await reader.getAuthorFeed({ actor: DID, cursor: undefined, filter: 'posts_and_author_threads' })).toEqual(
        {
          ok: true,
          val: { items: [], cursor: undefined, unavailable: 'blocked' },
        },
      );
    },
  );

  it('読めない応答を invalid_response にし、クエリの失敗はそのまま返す', async () => {
    const invalid = clientReturning(RA.ok({ posts: [] }));
    const error = { type: 'BlueskyClientError', kind: 'network', message: 'x' } as const;
    const failing = clientReturning(RA.err(error));

    expect(await invalid.reader.getAuthorFeed({ actor: DID, cursor: undefined, filter: 'posts_and_author_threads' }))
      .toMatchObject({
        ok: false,
        err: { kind: 'invalid_response' },
      });
    expect(await failing.reader.getAuthorFeed({ actor: DID, cursor: undefined, filter: 'posts_and_author_threads' }))
      .toEqual({ ok: false, err: error });
  });
});

describe('createBlueskyProfileReader.getActorLikes', () => {
  it('投稿とカーソルを返す', async () => {
    const { reader } = clientReturning(RA.ok({ feed: [postView], cursor: 'next' }));

    const result = await reader.getActorLikes({ actor: DID, cursor: undefined });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.val.cursor).toBe('next');
    expect(result.val.items).toHaveLength(1);
    expect(result.val.items[0]).toMatchObject({ uri: postView.post.uri, authorDid: DID, fetchedAt: NOW });
  });

  it('読めない応答を invalid_response にし、クエリの失敗はそのまま返す', async () => {
    const invalid = clientReturning(RA.ok({ posts: [] }));
    const error = { type: 'BlueskyClientError', kind: 'network', message: 'x' } as const;
    const failing = clientReturning(RA.err(error));

    expect(await invalid.reader.getActorLikes({ actor: DID, cursor: undefined })).toMatchObject({
      ok: false,
      err: { kind: 'invalid_response' },
    });
    expect(await failing.reader.getActorLikes({ actor: DID, cursor: undefined })).toEqual({ ok: false, err: error });
  });
});

describe.each(
  [
    { method: 'getFollows', nsid: 'app.bsky.graph.getFollows', key: 'follows' },
    { method: 'getFollowers', nsid: 'app.bsky.graph.getFollowers', key: 'followers' },
  ] as const,
)('createBlueskyProfileReader.$method', ({ method, key }) => {
  const bob = { did: 'did:plc:bob', handle: 'bob.bsky.social', displayName: 'Bob', viewer: { following: FOLLOW } };

  it('アカウントとカーソルを返し、読めないアカウントは捨てる', async () => {
    const { reader } = clientReturning(RA.ok({
      subject: { did: DID, handle: 'alice.bsky.social' },
      cursor: 'next',
      [key]: [bob, { handle: 'no-did.bsky.social' }, 'invalid'],
    }));

    expect(await reader[method]({ actor: DID, cursor: undefined })).toEqual({
      ok: true,
      val: {
        actors: [{
          did: 'did:plc:bob',
          handle: 'bob.bsky.social',
          displayName: 'Bob',
          avatar: null,
          description: null,
          followedByMe: true,
        }],
        cursor: 'next',
      },
    });
  });

  it('読めない応答を invalid_response にし、クエリの失敗はそのまま返す', async () => {
    const invalid = clientReturning(RA.ok({ actors: [] }));
    const notFound = {
      type: 'BlueskyClientError',
      kind: 'http',
      message: 'Profile not found',
      status: 400,
      code: 'InvalidRequest',
    } as const;
    const failing = clientReturning(RA.err(notFound));

    expect(await invalid.reader[method]({ actor: DID, cursor: undefined })).toMatchObject({
      ok: false,
      err: { kind: 'invalid_response' },
    });
    expect(await failing.reader[method]({ actor: DID, cursor: undefined })).toEqual({ ok: false, err: notFound });
  });
});
