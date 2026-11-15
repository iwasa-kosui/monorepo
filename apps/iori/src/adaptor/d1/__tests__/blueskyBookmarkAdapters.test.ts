import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1BlueskyBookmarkDeletedStore } from '../blueskyTimeline/blueskyBookmarkDeletedStore.ts';
import { createD1BlueskyBookmarkSavedStore } from '../blueskyTimeline/blueskyBookmarkSavedStore.ts';
import { createD1BlueskyBookmarkTargetResolver } from '../blueskyTimeline/blueskyBookmarkTargetResolver.ts';
import { createD1BlueskyViewerBookmarksSyncedStore } from '../blueskyTimeline/blueskyViewerBookmarksSyncedStore.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const POST = 'at://did:plc:a/app.bsky.feed.post/1';
const OTHER = 'at://did:plc:a/app.bsky.feed.post/2';
const at = (value: number) => Instant.orThrow(value);

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const { db, sqlite, queries } = fixture;
  const users = createMastodonSeed(fixture);
  const userId = UserId.orThrow(users.addLocalActor('alice').userId);
  const other = UserId.orThrow(users.addLocalActor('bob').userId);
  const bookmarks = (owner: string = userId) =>
    sqlite.prepare('SELECT subjectUri, createdAt FROM bluesky_bookmarks WHERE userId = ? ORDER BY subjectUri').all(
      owner,
    );
  const seed = (uri: string, createdAt: number, owner: string = userId) =>
    sqlite.prepare('INSERT INTO bluesky_bookmarks(userId,subjectUri,createdAt) VALUES (?,?,?)').run(
      owner,
      uri,
      createdAt,
    );
  return { db, sqlite, queries, userId, other, bookmarks, seed };
};

describe('D1 の bluesky_bookmarks', () => {
  describe('保存', () => {
    it('subjectUri と createdAt を保存し、同じ subjectUri の保存では行を増やさず createdAt を上書きする', async () => {
      const t = setup();
      const store = createD1BlueskyBookmarkSavedStore(t.db, t.userId);

      await store.save({ subjectUri: POST, createdAt: at(10) });
      await store.save({ subjectUri: POST, createdAt: at(20) });

      expect(t.bookmarks()).toEqual([{ subjectUri: POST, createdAt: 20 }]);
    });

    it('別のユーザーが同じ subjectUri をブックマークしていても、その行は書き換えない', async () => {
      const t = setup();
      t.seed(POST, 5, t.other);

      await createD1BlueskyBookmarkSavedStore(t.db, t.userId).save({ subjectUri: POST, createdAt: at(20) });

      expect(t.bookmarks()).toEqual([{ subjectUri: POST, createdAt: 20 }]);
      expect(t.bookmarks(t.other)).toEqual([{ subjectUri: POST, createdAt: 5 }]);
    });
  });

  describe('削除', () => {
    it('自分のブックマークだけを消し、別のユーザーの同じ subjectUri の行は残す', async () => {
      const t = setup();
      t.seed(POST, 1);
      t.seed(POST, 1, t.other);

      await createD1BlueskyBookmarkDeletedStore(t.db, t.userId).deleteBySubjectUri(POST);

      expect(t.bookmarks()).toEqual([]);
      expect(t.bookmarks(t.other)).toEqual([{ subjectUri: POST, createdAt: 1 }]);
    });
  });

  describe('対象の解決', () => {
    it('feedItemId から元の投稿の uri と cid を返し、無ければ undefined にする', async () => {
      const t = setup();
      t.sqlite.prepare(
        'INSERT INTO bluesky_timeline_items(userId,feedItemId,uri,cid,authorDid,authorHandle,text,facets,repostedByDid,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        t.userId,
        `${POST}#repost:did:plc:b`,
        POST,
        'bafypost',
        'did:plc:a',
        'alice.bsky.social',
        't',
        '[]',
        'did:plc:b',
        1,
        1,
        1,
      );
      const resolver = createD1BlueskyBookmarkTargetResolver(t.db, t.userId);

      expect(Result.unsafeUnwrap(await resolver.resolve(`${POST}#repost:did:plc:b`))).toEqual({
        uri: POST,
        cid: 'bafypost',
      });
      expect(Result.unsafeUnwrap(await resolver.resolve('unknown'))).toBeUndefined();
      expect(
        Result.unsafeUnwrap(
          await createD1BlueskyBookmarkTargetResolver(t.db, t.other).resolve(`${POST}#repost:did:plc:b`),
        ),
      ).toBeUndefined();
    });
  });

  describe('タイムラインとの同期', () => {
    it('保存済みの行は書き直さず、無い行だけを追加する', async () => {
      const t = setup();
      t.seed(POST, 1);
      const store = createD1BlueskyViewerBookmarksSyncedStore(t.db, t.userId);
      t.queries.length = 0;

      await store.sync([{ subjectUri: POST, createdAt: at(99) }, { subjectUri: OTHER, createdAt: at(99) }]);

      expect(t.bookmarks()).toEqual([{ subjectUri: POST, createdAt: 1 }, { subjectUri: OTHER, createdAt: 99 }]);
      expect(t.queries.filter((query) => /^insert/i.test(query.sql))).toHaveLength(1);
    });

    it('多くの行でもまとめて追加できる', async () => {
      const t = setup();
      const store = createD1BlueskyViewerBookmarksSyncedStore(t.db, t.userId);
      const uris = Array.from({ length: 65 }, (_, index) => `at://did:plc:a/app.bsky.feed.post/${index}`);

      await store.sync(uris.map((subjectUri) => ({ subjectUri, createdAt: at(5) })));

      expect(t.bookmarks()).toHaveLength(65);
    });

    it('deleteStale は指定した uri のうち createdAt が基準より前の行だけを消す', async () => {
      const t = setup();
      t.seed(POST, 100);
      t.seed(OTHER, 900);
      t.seed('at://did:plc:a/app.bsky.feed.post/3', 100);
      t.seed(POST, 100, t.other);
      const store = createD1BlueskyViewerBookmarksSyncedStore(t.db, t.userId);

      await store.deleteStale([POST, OTHER], at(500));

      expect(t.bookmarks()).toEqual([
        { subjectUri: OTHER, createdAt: 900 },
        { subjectUri: 'at://did:plc:a/app.bsky.feed.post/3', createdAt: 100 },
      ]);
      expect(t.bookmarks(t.other)).toEqual([{ subjectUri: POST, createdAt: 100 }]);
    });
  });
});
