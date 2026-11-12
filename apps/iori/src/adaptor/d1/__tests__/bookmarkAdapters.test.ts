import { describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Bookmark } from '../../../domain/bookmark/bookmark.ts';
import { BookmarkId } from '../../../domain/bookmark/bookmarkId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { createD1BookmarkCreatedStore } from '../bookmark/bookmarkCreatedStore.ts';
import { createD1BookmarkDeletedStore } from '../bookmark/bookmarkDeletedStore.ts';
import { createD1BookmarkedPostIdsResolverByActorIdWithPagination } from '../bookmark/bookmarkedPostIdsResolverByActorIdWithPagination.ts';
import { createD1BookmarkResolver } from '../bookmark/bookmarkResolver.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('kosui');
  const other = seed.addLocalActor('other');
  const alice = seed.addRemoteActor('alice');
  const count = (table: string, where = '1=1') =>
    Number(
      (fixture.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number | bigint }).n,
    );
  const bookmark = (actorId: string, postId: string, at = 1_000) =>
    Bookmark.createBookmark({
      bookmarkId: BookmarkId.generate(),
      actorId: ActorId.orThrow(actorId),
      postId: PostId.orThrow(postId),
    }, Instant.orThrow(at));
  const newestFirst = (limit: number, olderThanId?: string) => ({
    limit,
    olderThanId,
    newerThanId: undefined,
    order: 'newestFirst' as const,
  });
  return { fixture, seed, me, other, alice, count, bookmark, newestFirst };
};

describe('D1 の bookmark の store と resolver', () => {
  it('作成の store が bookmarks とドメインイベントを同時に保存し、resolver が取り出す', async () => {
    const t = setup();
    const post = t.seed.addRemotePost(t.alice, 1_000, { visibility: 'public' });
    const created = t.bookmark(t.me.actorId, post.postId);

    await createD1BookmarkCreatedStore(t.fixture.db).store(created);

    expect(t.count('bookmarks')).toBe(1);
    expect(t.count('domain_events', `eventName='bookmark.bookmarkCreated'`)).toBe(1);
    const resolver = createD1BookmarkResolver(t.fixture.db);
    const resolved = await resolver.resolve({
      actorId: ActorId.orThrow(t.me.actorId),
      postId: PostId.orThrow(post.postId),
    });
    const ofOther = await resolver.resolve({
      actorId: ActorId.orThrow(t.other.actorId),
      postId: PostId.orThrow(post.postId),
    });
    expect(resolved).toMatchObject({ ok: true, val: created.aggregateState });
    expect(ofOther).toMatchObject({ ok: true, val: undefined });
  });

  it('同じ組み合わせを2回保存すると2回目は失敗し、bookmarks もドメインイベントも1件のまま残る', async () => {
    const t = setup();
    const post = t.seed.addRemotePost(t.alice, 1_000, { visibility: 'public' });
    const store = createD1BookmarkCreatedStore(t.fixture.db);

    await store.store(t.bookmark(t.me.actorId, post.postId));
    await expect(store.store(t.bookmark(t.me.actorId, post.postId))).rejects.toThrow();

    expect(t.count('bookmarks')).toBe(1);
    expect(t.count('domain_events')).toBe(1);
  });

  it('削除の store が bookmarks の行を消してドメインイベントを保存する', async () => {
    const t = setup();
    const post = t.seed.addRemotePost(t.alice, 1_000, { visibility: 'public' });
    const created = t.bookmark(t.me.actorId, post.postId);
    await createD1BookmarkCreatedStore(t.fixture.db).store(created);

    await createD1BookmarkDeletedStore(t.fixture.db).store(
      Bookmark.deleteBookmark(created.aggregateState, Instant.orThrow(2_000)),
    );

    expect(t.count('bookmarks')).toBe(0);
    expect(t.count('domain_events', `eventName='bookmark.bookmarkDeleted'`)).toBe(1);
  });

  it('一覧の resolver は自分のブックマークを新しい順に返し、削除済みと見えない投稿を除く', async () => {
    const t = setup();
    const first = t.seed.addRemotePost(t.alice, 1_000, { visibility: 'public' });
    const second = t.seed.addRemotePost(t.alice, 2_000, { visibility: 'public' });
    const deleted = t.seed.addLocalPost(t.me, 3_000, { deletedAt: 4_000 });
    const hidden = t.seed.addRemotePost(t.alice, 5_000, { visibility: 'direct' });
    const firstBookmark = t.seed.addBookmark(t.me.actorId, first.postId, 10_000);
    const secondBookmark = t.seed.addBookmark(t.me.actorId, second.postId, 20_000);
    t.seed.addBookmark(t.me.actorId, deleted.postId, 30_000);
    t.seed.addBookmark(t.me.actorId, hidden.postId, 40_000);
    t.seed.addBookmark(t.other.actorId, first.postId, 50_000);
    const resolver = createD1BookmarkedPostIdsResolverByActorIdWithPagination(t.fixture.db);

    const resolved = await resolver.resolve({ actorId: ActorId.orThrow(t.me.actorId), page: t.newestFirst(10) });

    expect(resolved).toMatchObject({
      ok: true,
      val: [
        { bookmarkId: secondBookmark.bookmarkId, postId: second.postId },
        { bookmarkId: firstBookmark.bookmarkId, postId: first.postId },
      ],
    });
  });

  it('一覧の resolver は limit まで返し、他人のブックマークの ID を位置にしても時刻を引かない', async () => {
    const t = setup();
    const first = t.seed.addRemotePost(t.alice, 1_000, { visibility: 'public' });
    const second = t.seed.addRemotePost(t.alice, 2_000, { visibility: 'public' });
    t.seed.addBookmark(t.me.actorId, first.postId, 10_000);
    const newer = t.seed.addBookmark(t.me.actorId, second.postId, 20_000);
    const foreign = t.seed.addBookmark(t.other.actorId, first.postId, 30_000);
    const resolver = createD1BookmarkedPostIdsResolverByActorIdWithPagination(t.fixture.db);
    const actorId = ActorId.orThrow(t.me.actorId);

    const newest = await resolver.resolve({ actorId, page: t.newestFirst(1) });
    const afterForeign = await resolver.resolve({ actorId, page: t.newestFirst(10, foreign.bookmarkId) });

    expect(newest).toMatchObject({ ok: true, val: [{ bookmarkId: newer.bookmarkId, postId: second.postId }] });
    expect(afterForeign).toMatchObject({ ok: true, val: [] });
  });
});
