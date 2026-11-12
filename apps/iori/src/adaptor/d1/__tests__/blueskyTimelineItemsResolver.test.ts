import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { createD1BlueskyTimelineItemsResolver } from '../blueskyTimeline/blueskyTimelineItemsResolver.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const BASE = Date.UTC(2026, 10, 8, 12);

const setup = (
  rows: ReadonlyArray<
    Readonly<{ feedItemId: string; indexedAt: number; uri?: string; repostedByDid?: string; authorDid?: string }>
  >,
  crosspostUris: readonly (string | null)[] = [],
  likedUris: readonly string[] = [],
  repostedUris: readonly string[] = [],
) => {
  const { sqlite, db, queries } = createSqliteD1Fixture();
  const insert = sqlite.prepare(
    'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,repostedByDid,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );
  for (const row of rows) {
    insert.run(
      row.feedItemId,
      row.uri ?? row.feedItemId,
      'cid',
      row.authorDid ?? 'did:plc:a',
      'alice.bsky.social',
      'text',
      '[]',
      row.repostedByDid ?? null,
      1,
      row.indexedAt,
      1,
    );
  }
  const insertCrosspost = sqlite.prepare(
    'INSERT INTO bluesky_crossposts(postId,status,uri,attempts,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',
  );
  crosspostUris.forEach((uri, index) => insertCrosspost.run(`post-${index}`, 'sent', uri, 1, 1, 1));
  const insertLike = sqlite.prepare('INSERT INTO bluesky_likes(subjectUri,likeUri,createdAt) VALUES (?,?,?)');
  likedUris.forEach((uri, index) => insertLike.run(uri, `at://did:plc:me/app.bsky.feed.like/3k${index}`, 1));
  const insertRepost = sqlite.prepare('INSERT INTO bluesky_reposts(subjectUri,repostUri,createdAt) VALUES (?,?,?)');
  repostedUris.forEach((uri, index) => insertRepost.run(uri, `at://did:plc:me/app.bsky.feed.repost/3k${index}`, 1));
  const resolver = createD1BlueskyTimelineItemsResolver(db);
  return {
    queries,
    moderate: (did: string, muted: number, blockUri: string | null) =>
      sqlite.prepare('INSERT INTO bluesky_moderated_actors(did,muted,blockUri,updatedAt) VALUES (?,?,?,?)')
        .run(did, muted, blockUri, 1),
    resolveItems: async (limit: number) => Result.unsafeUnwrap(await resolver.resolve({ limit, before: undefined })),
    resolve: async (input: { limit: number; before?: number; beforeId?: string; excludeCrossposted?: boolean }) =>
      Result.unsafeUnwrap(
        await resolver.resolve({
          limit: input.limit,
          before: input.before === undefined ? undefined : Instant.orThrow(input.before),
          beforeId: input.beforeId,
          excludeCrossposted: input.excludeCrossposted,
        }),
      ).map((item) => item.feedItemId),
  };
};

describe('D1 の bluesky_timeline_items リゾルバー', () => {
  const rows = [
    { feedItemId: 'a', indexedAt: BASE },
    { feedItemId: 'b', indexedAt: BASE },
    { feedItemId: 'c', indexedAt: BASE },
    { feedItemId: 'd', indexedAt: BASE },
    { feedItemId: 'e', indexedAt: BASE - 1000 },
  ];

  it('indexedAt の降順、同じ値なら feedItemId の降順で返す', async () => {
    const t = setup(rows);

    expect(await t.resolve({ limit: 10 })).toEqual(['d', 'c', 'b', 'a', 'e']);
  });

  it('beforeId が無いときは indexedAt が before より小さい行だけを返す', async () => {
    const t = setup(rows);

    expect(await t.resolve({ limit: 10, before: BASE })).toEqual(['e']);
  });

  it('同じ ms の行がページ境界をまたいでも、(indexedAt, feedItemId) のカーソルで抜けずに続きを取る', async () => {
    const t = setup(rows);

    const first = await t.resolve({ limit: 2 });
    const second = await t.resolve({ limit: 2, before: BASE, beforeId: first.at(-1) });
    const third = await t.resolve({ limit: 2, before: BASE, beforeId: second.at(-1) });

    expect(first).toEqual(['d', 'c']);
    expect(second).toEqual(['b', 'a']);
    expect(third).toEqual(['e']);
  });

  describe('excludeCrossposted', () => {
    const crosspostRows = [
      { feedItemId: 'own', uri: 'at://own', indexedAt: BASE },
      { feedItemId: 'at://own#repost:did:plc:b', uri: 'at://own', repostedByDid: 'did:plc:b', indexedAt: BASE - 1 },
      { feedItemId: 'other', uri: 'at://other', indexedAt: BASE - 2 },
    ];

    it('crosspost と同じ uri の通常の行だけを除き、同じ uri の repost の行は残す', async () => {
      const t = setup(crosspostRows, ['at://own']);

      expect(await t.resolve({ limit: 10, excludeCrossposted: true })).toEqual([
        'at://own#repost:did:plc:b',
        'other',
      ]);
    });

    it('指定が無いときは crosspost の行も返す', async () => {
      const t = setup(crosspostRows, ['at://own']);

      expect(await t.resolve({ limit: 10 })).toEqual(['own', 'at://own#repost:did:plc:b', 'other']);
    });

    it('uri が NULL の crosspost は行を除かない', async () => {
      const t = setup(crosspostRows, [null]);

      expect(await t.resolve({ limit: 10, excludeCrossposted: true })).toEqual([
        'own',
        'at://own#repost:did:plc:b',
        'other',
      ]);
    });

    it('除いた行を数えずに limit まで返し、カーソルとも併用できる', async () => {
      const t = setup(crosspostRows, ['at://own']);

      expect(await t.resolve({ limit: 1, excludeCrossposted: true })).toEqual(['at://own#repost:did:plc:b']);
      expect(await t.resolve({ limit: 10, before: BASE - 1, excludeCrossposted: true })).toEqual(['other']);
    });
  });

  describe('liked', () => {
    const likeRows = [
      { feedItemId: 'own', uri: 'at://own', indexedAt: BASE },
      { feedItemId: 'at://own#repost:did:plc:b', uri: 'at://own', repostedByDid: 'did:plc:b', indexedAt: BASE - 1 },
      { feedItemId: 'other', uri: 'at://other', indexedAt: BASE - 2 },
    ];

    it('bluesky_likes に同じ uri の行があれば、通常の行も repost の行も liked にする', async () => {
      const t = setup(likeRows, [], ['at://own']);

      const items = await t.resolveItems(10);

      expect(items.map((item) => [item.feedItemId, item.liked])).toEqual([
        ['own', true],
        ['at://own#repost:did:plc:b', true],
        ['other', false],
      ]);
    });

    it('いいねの行があっても、タイムラインの行を増やさない', async () => {
      const t = setup(likeRows, [], ['at://own', 'at://other']);

      expect(await t.resolveItems(10)).toHaveLength(3);
    });

    it('liked の付与で D1 のクエリを増やさず、1 回の SELECT にまとめる', async () => {
      const t = setup(likeRows, [], ['at://own']);
      t.queries.length = 0;

      await t.resolveItems(10);

      expect(t.queries).toHaveLength(1);
      expect(t.queries[0]?.sql).toMatch(/^select .* left join "bluesky_likes"/is);
    });
  });

  describe('reposted', () => {
    const repostRows = [
      { feedItemId: 'own', uri: 'at://own', indexedAt: BASE },
      { feedItemId: 'at://own#repost:did:plc:b', uri: 'at://own', repostedByDid: 'did:plc:b', indexedAt: BASE - 1 },
      { feedItemId: 'other', uri: 'at://other', indexedAt: BASE - 2 },
    ];

    it('bluesky_reposts に同じ uri の行があれば、通常の行も repost の行も reposted にする', async () => {
      const t = setup(repostRows, [], [], ['at://own']);

      const items = await t.resolveItems(10);

      expect(items.map((item) => [item.feedItemId, item.reposted])).toEqual([
        ['own', true],
        ['at://own#repost:did:plc:b', true],
        ['other', false],
      ]);
    });

    it('いいねとリポストを別々に付け、タイムラインの行を増やさない', async () => {
      const t = setup(repostRows, [], ['at://own'], ['at://own', 'at://other']);

      const items = await t.resolveItems(10);

      expect(items.map((item) => [item.feedItemId, item.liked, item.reposted])).toEqual([
        ['own', true, true],
        ['at://own#repost:did:plc:b', true, true],
        ['other', false, true],
      ]);
    });

    it('reposted の付与で D1 のクエリを増やさず、1 回の SELECT にまとめる', async () => {
      const t = setup(repostRows, [], [], ['at://own']);
      t.queries.length = 0;

      await t.resolveItems(10);

      expect(t.queries).toHaveLength(1);
      expect(t.queries[0]?.sql).toMatch(/^select .* left join "bluesky_reposts"/is);
    });
  });

  describe('ミュートとブロックの除外', () => {
    const BLOCK = 'at://did:plc:me/app.bsky.graph.block/3kblock';
    const moderationRows = [
      { feedItemId: 'by-a', authorDid: 'did:plc:a', indexedAt: BASE },
      { feedItemId: 'by-muted', authorDid: 'did:plc:muted', indexedAt: BASE - 1 },
      { feedItemId: 'by-blocked', authorDid: 'did:plc:blocked', indexedAt: BASE - 2 },
      {
        feedItemId: 'a-reposted-by-muted',
        authorDid: 'did:plc:a',
        repostedByDid: 'did:plc:muted',
        indexedAt: BASE - 3,
      },
      {
        feedItemId: 'a-reposted-by-blocked',
        authorDid: 'did:plc:a',
        repostedByDid: 'did:plc:blocked',
        indexedAt: BASE - 4,
      },
      { feedItemId: 'a-reposted-by-b', authorDid: 'did:plc:a', repostedByDid: 'did:plc:b', indexedAt: BASE - 5 },
      {
        feedItemId: 'muted-reposted-by-b',
        authorDid: 'did:plc:muted',
        repostedByDid: 'did:plc:b',
        indexedAt: BASE - 6,
      },
    ];

    it('ミュートした相手の投稿と、その人のリポストを除く', async () => {
      const t = setup(moderationRows);
      t.moderate('did:plc:muted', 1, null);

      expect(await t.resolve({ limit: 10 })).toEqual([
        'by-a',
        'by-blocked',
        'a-reposted-by-blocked',
        'a-reposted-by-b',
      ]);
    });

    it('ブロックした相手の投稿と、その人のリポストを除く', async () => {
      const t = setup(moderationRows);
      t.moderate('did:plc:blocked', 0, BLOCK);

      expect(await t.resolve({ limit: 10 })).toEqual([
        'by-a',
        'by-muted',
        'a-reposted-by-muted',
        'a-reposted-by-b',
        'muted-reposted-by-b',
      ]);
    });

    it('ミュートもブロックもしていない行がある DID の投稿は残す', async () => {
      const t = setup(moderationRows);
      t.moderate('did:plc:muted', 0, null);

      expect(await t.resolve({ limit: 10 })).toHaveLength(moderationRows.length);
    });

    it('除いた行を数えずに limit まで返し、カーソルと excludeCrossposted とも併用できる', async () => {
      const t = setup(moderationRows, ['by-a']);
      t.moderate('did:plc:muted', 1, null);

      expect(await t.resolve({ limit: 2 })).toEqual(['by-a', 'by-blocked']);
      expect(await t.resolve({ limit: 10, before: BASE - 1, beforeId: 'by-muted' })).toEqual([
        'by-blocked',
        'a-reposted-by-blocked',
        'a-reposted-by-b',
      ]);
      expect(await t.resolve({ limit: 10, excludeCrossposted: true })).toEqual([
        'by-blocked',
        'a-reposted-by-blocked',
        'a-reposted-by-b',
      ]);
    });

    it('除外を付けても、タイムラインの取得は 1 回の SELECT のままにする', async () => {
      const t = setup(moderationRows);
      t.moderate('did:plc:muted', 1, null);
      t.queries.length = 0;

      await t.resolveItems(10);

      expect(t.queries).toHaveLength(1);
    });
  });
});
