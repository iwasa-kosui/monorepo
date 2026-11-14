import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyQueryClient } from '../../ports/blueskyClient.ts';
import { createBlueskyBookmarkReader } from './blueskyBookmarkReader.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 12));
const DID = 'did:plc:alice';
const clientReturning = (response: ReturnType<BlueskyQueryClient['query']>) => {
  const query = vi.fn(() => response);
  return { query, reader: createBlueskyBookmarkReader({ client: { query }, now: () => NOW }) };
};
const postView = (n: number, overrides: Record<string, unknown> = {}) => ({
  $type: 'app.bsky.feed.defs#postView',
  uri: `at://${DID}/app.bsky.feed.post/${n}`,
  cid: `bafycid${n}`,
  author: { did: DID, handle: 'alice.bsky.social' },
  record: { $type: 'app.bsky.feed.post', text: `post ${n}`, createdAt: '2026-11-08T01:00:00.000Z' },
  indexedAt: '2026-11-08T01:00:05.000Z',
  ...overrides,
});
const bookmarkView = (item: unknown, uri = `at://${DID}/app.bsky.feed.post/1`) => ({
  subject: { uri, cid: 'bafycid' },
  item,
  createdAt: '2026-11-09T00:00:00.000Z',
});

describe('createBlueskyBookmarkReader.getBookmarks', () => {
  it('app.bsky.bookmark.getBookmarks を limit だけで呼び、postView を項目にして cursor を返す', async () => {
    const { query, reader } = clientReturning(RA.ok({
      bookmarks: [bookmarkView(postView(1)), bookmarkView(postView(2))],
      cursor: 'next-cursor',
    }));

    const result = await reader.getBookmarks({ cursor: undefined });

    expect(query).toHaveBeenCalledExactlyOnceWith('app.bsky.bookmark.getBookmarks', { limit: '30' });
    expect(result).toMatchObject({
      ok: true,
      val: {
        items: [
          {
            feedItemId: `at://${DID}/app.bsky.feed.post/1`,
            uri: `at://${DID}/app.bsky.feed.post/1`,
            cid: 'bafycid1',
            text: 'post 1',
            repostedByDid: null,
            fetchedAt: NOW,
            bookmarked: true,
          },
          { uri: `at://${DID}/app.bsky.feed.post/2`, bookmarked: true },
        ],
        cursor: 'next-cursor',
      },
    });
  });

  it('viewer.bookmarked が無い postView でも、ブックマークの一覧なので bookmarked にする', async () => {
    const { reader } = clientReturning(RA.ok({
      bookmarks: [bookmarkView(postView(1, { viewer: { like: 'at://did:plc:me/app.bsky.feed.like/3k' } }))],
    }));

    expect(await reader.getBookmarks({ cursor: undefined })).toMatchObject({
      ok: true,
      val: { items: [{ bookmarked: true, liked: true }] },
    });
  });

  it('blockedPost と notFoundPost は除き、postView だけを残す', async () => {
    const { reader } = clientReturning(RA.ok({
      bookmarks: [
        bookmarkView({
          $type: 'app.bsky.feed.defs#blockedPost',
          uri: `at://${DID}/app.bsky.feed.post/9`,
          blocked: true,
          author: { did: DID },
        }),
        bookmarkView({
          $type: 'app.bsky.feed.defs#notFoundPost',
          uri: `at://${DID}/app.bsky.feed.post/8`,
          notFound: true,
        }),
        bookmarkView(postView(1)),
      ],
    }));

    const result = await reader.getBookmarks({ cursor: undefined });

    expect(result).toMatchObject({ ok: true, val: { items: [{ uri: `at://${DID}/app.bsky.feed.post/1` }] } });
    expect(result.ok && result.val.items).toHaveLength(1);
  });

  it('項目に変換できない要素は除く', async () => {
    const { reader } = clientReturning(RA.ok({
      bookmarks: [
        'not an object',
        bookmarkView(postView(1, { indexedAt: 'not a date' })),
        bookmarkView(postView(2)),
      ],
    }));

    const result = await reader.getBookmarks({ cursor: undefined });

    expect(result.ok && result.val.items.map((item) => item.uri)).toEqual([`at://${DID}/app.bsky.feed.post/2`]);
  });

  it('bookmarks が配列でない応答は invalid_response にする', async () => {
    const { reader } = clientReturning(RA.ok({ bookmarks: 'oops' }));

    expect(await reader.getBookmarks({ cursor: undefined })).toMatchObject({
      ok: false,
      err: { type: 'BlueskyClientError', kind: 'invalid_response' },
    });
  });
});
