import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1BlueskyTimelineItemsResolver } from '../blueskyTimeline/blueskyTimelineItemsResolver.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const BASE = Date.UTC(2026, 10, 8, 12);
const ME = UserId.orThrow('00000000-0000-4000-8000-0000000000a1');
const OTHER = UserId.orThrow('00000000-0000-4000-8000-0000000000b2');

const setup = (
  rows: ReadonlyArray<
    Readonly<{ feedItemId: string; indexedAt: number; uri?: string; repostedByDid?: string; authorDid?: string }>
  >,
  crosspostUris: readonly (string | null)[] = [],
  likedUris: readonly string[] = [],
  repostedUris: readonly string[] = [],
  bookmarkedUris: readonly string[] = [],
) => {
  const fixture = createSqliteD1Fixture();
  const { sqlite, db, queries } = fixture;
  const users = createMastodonSeed(fixture);
  users.addLocalActor('me', ME);
  users.addLocalActor('other', OTHER);
  const insert = sqlite.prepare(
    'INSERT INTO bluesky_timeline_items(userId,feedItemId,uri,cid,authorDid,authorHandle,text,facets,repostedByDid,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  );
  const addItem = (
    owner: UserId,
    row: Readonly<{ feedItemId: string; indexedAt: number; uri?: string; repostedByDid?: string; authorDid?: string }>,
  ) =>
    insert.run(
      owner,
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
  for (const row of rows) addItem(ME, row);
  const insertCrosspost = sqlite.prepare(
    'INSERT INTO bluesky_crossposts(postId,userId,status,uri,attempts,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)',
  );
  let crosspostCount = 0;
  const addCrosspost = (owner: UserId, uri: string | null) =>
    insertCrosspost.run(`post-${crosspostCount++}`, owner, 'sent', uri, 1, 1, 1);
  crosspostUris.forEach((uri) => addCrosspost(ME, uri));
  const insertLike = sqlite.prepare('INSERT INTO bluesky_likes(userId,subjectUri,likeUri,createdAt) VALUES (?,?,?,?)');
  const addLike = (owner: UserId, uri: string) => insertLike.run(owner, uri, `${uri}#like`, 1);
  likedUris.forEach((uri) => addLike(ME, uri));
  const insertRepost = sqlite.prepare(
    'INSERT INTO bluesky_reposts(userId,subjectUri,repostUri,createdAt) VALUES (?,?,?,?)',
  );
  const addRepost = (owner: UserId, uri: string) => insertRepost.run(owner, uri, `${uri}#repost`, 1);
  repostedUris.forEach((uri) => addRepost(ME, uri));
  const insertBookmark = sqlite.prepare('INSERT INTO bluesky_bookmarks(userId,subjectUri,createdAt) VALUES (?,?,?)');
  const addBookmark = (owner: UserId, uri: string) => insertBookmark.run(owner, uri, 1);
  bookmarkedUris.forEach((uri) => addBookmark(ME, uri));
  const resolver = createD1BlueskyTimelineItemsResolver(db, ME);
  return {
    queries,
    addItem,
    addCrosspost,
    addLike,
    addRepost,
    addBookmark,
    moderate: (did: string, muted: number, blockUri: string | null, owner: UserId = ME) =>
      sqlite.prepare('INSERT INTO bluesky_moderated_actors(userId,did,muted,blockUri,updatedAt) VALUES (?,?,?,?,?)')
        .run(owner, did, muted, blockUri, 1),
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
  });

  describe('bookmarked', () => {
    const bookmarkRows = [
      { feedItemId: 'own', uri: 'at://own', indexedAt: BASE },
      { feedItemId: 'at://own#repost:did:plc:b', uri: 'at://own', repostedByDid: 'did:plc:b', indexedAt: BASE - 1 },
      { feedItemId: 'other', uri: 'at://other', indexedAt: BASE - 2 },
    ];

    it('bluesky_bookmarks に同じ uri の行があれば、通常の行も repost の行も bookmarked にする', async () => {
      const t = setup(bookmarkRows, [], [], [], ['at://own']);

      const items = await t.resolveItems(10);

      expect(items.map((item) => [item.feedItemId, item.bookmarked])).toEqual([
        ['own', true],
        ['at://own#repost:did:plc:b', true],
        ['other', false],
      ]);
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

  describe('ユーザーごとの分離', () => {
    it('別のユーザーのタイムラインの項目は返さない', async () => {
      const t = setup([{ feedItemId: 'mine', indexedAt: BASE }]);
      t.addItem(OTHER, { feedItemId: 'theirs', indexedAt: BASE + 1 });

      expect(await t.resolve({ limit: 10 })).toEqual(['mine']);
    });

    it('同じ feedItemId を別のユーザーも持っていても、自分の行だけを 1 件返す', async () => {
      const t = setup([{ feedItemId: 'shared', indexedAt: BASE }]);
      t.addItem(OTHER, { feedItemId: 'shared', indexedAt: BASE });

      expect(await t.resolve({ limit: 10 })).toEqual(['shared']);
    });

    it('別のユーザーのいいね・リポスト・ブックマークを自分のものとして示さない', async () => {
      const t = setup([{ feedItemId: 'item', uri: 'at://shared', indexedAt: BASE }]);
      t.addLike(OTHER, 'at://shared');
      t.addRepost(OTHER, 'at://shared');
      t.addBookmark(OTHER, 'at://shared');

      const [item] = await t.resolveItems(10);

      expect(item).toMatchObject({ liked: false, reposted: false, bookmarked: false });
    });

    it('別のユーザーのミュート・ブロックでは除かない', async () => {
      const t = setup([
        { feedItemId: 'by-x', authorDid: 'did:plc:x', indexedAt: BASE },
        { feedItemId: 'by-y', authorDid: 'did:plc:y', indexedAt: BASE - 1 },
      ]);
      t.moderate('did:plc:x', 1, null, OTHER);
      t.moderate('did:plc:y', 0, 'at://did:plc:other/app.bsky.graph.block/1', OTHER);

      expect(await t.resolve({ limit: 10 })).toEqual(['by-x', 'by-y']);
    });

    it('excludeCrossposted は、別のユーザーのクロスポストと同じ uri の行を除かない', async () => {
      const t = setup([{ feedItemId: 'item', uri: 'at://theirs', indexedAt: BASE }]);
      t.addCrosspost(OTHER, 'at://theirs');

      expect(await t.resolve({ limit: 10, excludeCrossposted: true })).toEqual(['item']);
    });
  });
});
