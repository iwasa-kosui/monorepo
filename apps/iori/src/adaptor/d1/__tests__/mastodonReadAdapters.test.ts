import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { PageRequest } from '../../../domain/page/page.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { createD1AccountProfilesResolverByActorIds } from '../actor/accountProfilesResolverByActorIds.ts';
import { createD1FederatedTimelineItemsResolver } from '../federatedTimeline/federatedTimelineItemsResolver.ts';
import {
  createD1ActorIdsResolverByFollowerIdWithPagination,
  createD1ActorIdsResolverByFollowingIdWithPagination,
} from '../follow/actorIdsResolverByFollowsWithPagination.ts';
import { createD1LocalPostsResolverByPage } from '../post/localPostsResolverByPage.ts';
import { createD1PostExtrasResolverByPosts } from '../post/postExtrasResolverByPosts.ts';
import {
  createD1PostsWithAuthorResolverByPostIds,
  enrichPostRows,
  postRowsQuery,
} from '../post/postWithAuthorBatch.ts';
import { createD1ThreadResolver } from '../post/threadResolver.ts';
import { createD1TimelineItemsResolverByActorIds } from '../timeline/timelineItemsResolverByActorIds.ts';
import { createMastodonSeed, SEED_ORIGIN } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  return { ...fixture, seed: createMastodonSeed(fixture) };
};

const page = (overrides: Partial<PageRequest> = {}): PageRequest => ({
  limit: 20,
  olderThanId: undefined,
  newerThanId: undefined,
  order: 'newestFirst',
  ...overrides,
});

const actorId = (id: string) => ActorId.orThrow(id);
const postIdOf = (item: { post: { postId: string } }) => item.post.postId;

describe('createD1TimelineItemsResolverByActorIds with page', () => {
  const seedTimeline = () => {
    const ctx = setup();
    const me = ctx.seed.addLocalActor('kosui');
    const alice = ctx.seed.addRemoteActor('alice');
    const first = ctx.seed.addLocalPost(me, 1_000);
    const sameA = ctx.seed.addLocalPost(me, 2_000);
    const sameB = ctx.seed.addLocalPost(me, 2_000);
    const aliceNote = ctx.seed.addRemotePost(alice, 3_000, { timeline: true });
    const repost = ctx.seed.addRepost(me.actorId, aliceNote.postId, 4_000);
    const resolve = (input: Partial<PageRequest>, mutedActorIds: string[] = []) =>
      createD1TimelineItemsResolverByActorIds(ctx.db).resolve({
        actorIds: [actorId(me.actorId), actorId(alice.actorId)],
        currentActorId: actorId(me.actorId),
        createdAt: undefined,
        mutedActorIds: mutedActorIds.map(actorId),
        page: page(input),
      });
    return { ...ctx, me, alice, first, sameA, sameB, aliceNote, repost, resolve };
  };

  it('新しい順に返し、ブーストの項目に repostId を入れる', async () => {
    const t = seedTimeline();

    const result = await t.resolve({});

    expect(result.ok && result.val.map((item) => item.type)).toEqual(['repost', 'post', 'post', 'post', 'post']);
    const boost = result.ok ? result.val[0] : undefined;
    expect(boost?.type === 'repost' && boost.repostId).toBe(t.repost.repostId);
    expect(result.ok && result.val.slice(2, 4).map(postIdOf).sort()).toEqual([t.sameA.postId, t.sameB.postId].sort());
  });

  it('max_id に postId と repostId の両方を使え、同じミリ秒の 2 件を取りこぼさない', async () => {
    const t = seedTimeline();
    const all = await t.resolve({});
    const ids = all.ok ? all.val.map((item) => item.type === 'repost' ? item.repostId : item.post.postId) : [];

    const afterBoost = await t.resolve({ olderThanId: ids[0] });
    const afterFirstOfPair = await t.resolve({ olderThanId: ids[2] });
    const limited = await t.resolve({ limit: 2, olderThanId: ids[1] });

    expect(afterBoost.ok && afterBoost.val.map(postIdOf)).toEqual(all.ok ? all.val.slice(1).map(postIdOf) : []);
    expect(afterFirstOfPair.ok && afterFirstOfPair.val.map(postIdOf)).toEqual(
      all.ok ? all.val.slice(3).map(postIdOf) : [],
    );
    expect(limited.ok && limited.val.map(postIdOf)).toEqual(all.ok ? all.val.slice(2, 4).map(postIdOf) : []);
  });

  it('min_id は新しい側を古い順に limit 件取り、since_id は新しい側を新しい順に返す', async () => {
    const t = seedTimeline();
    const all = await t.resolve({});
    const ids = all.ok ? all.val.map((item) => item.type === 'repost' ? item.repostId : item.post.postId) : [];
    const newestFirst = all.ok ? all.val.map(postIdOf) : [];

    const min = await t.resolve({ newerThanId: ids[4], order: 'oldestFirst', limit: 2 });
    const since = await t.resolve({ newerThanId: ids[4], limit: 2 });

    expect(min.ok && min.val.map(postIdOf)).toEqual([newestFirst[3], newestFirst[2]]);
    expect(since.ok && since.val.map(postIdOf)).toEqual([newestFirst[0], newestFirst[1]]);
  });

  it('repostId が NULL の repost の行は postId で通常の投稿として返し、その postId を max_id に使える', async () => {
    const t = seedTimeline();
    const orphan = t.seed.addLocalPost(t.me, 3_500, { timeline: false });
    t.seed.addTimelineItem(t.me.actorId, orphan.postId, 3_500, { type: 'repost', repostId: null });

    const all = await t.resolve({});
    const afterOrphan = await t.resolve({ olderThanId: orphan.postId });

    expect(all.ok && all.val.map((item) => item.type)).toEqual(['repost', 'post', 'post', 'post', 'post', 'post']);
    expect(all.ok && all.val[1]?.post.postId).toBe(orphan.postId);
    expect(afterOrphan.ok && afterOrphan.val.map(postIdOf)).toEqual(all.ok ? all.val.slice(2).map(postIdOf) : []);
  });

  it('username が NULL の remote actor のブーストも repost の項目として返す', async () => {
    const t = seedTimeline();
    const ghost = t.seed.addRemoteActor('ghost');
    t.sqlite.prepare('UPDATE remote_actors SET username = NULL WHERE actorId = ?').run(ghost.actorId);
    const ghostBoost = t.seed.addRepost(ghost.actorId, t.first.postId, 5_000);

    const result = await createD1TimelineItemsResolverByActorIds(t.db).resolve({
      actorIds: [actorId(t.me.actorId), actorId(ghost.actorId)],
      currentActorId: actorId(t.me.actorId),
      createdAt: undefined,
      mutedActorIds: [],
      page: page({ limit: 1 }),
    });

    const top = result.ok ? result.val[0] : undefined;
    expect(top?.type === 'repost' && top.repostId).toBe(ghostBoost.repostId);
  });

  it('ミュートした投稿者を SQL で除いても件数が limit になる', async () => {
    const t = seedTimeline();

    const result = await t.resolve({ limit: 2 }, [t.alice.actorId]);

    expect(result.ok && result.val).toHaveLength(2);
    expect(result.ok && result.val.every((item) => item.post.actorId !== t.alice.actorId)).toBe(true);
  });

  it('同じ名前のリアクションは URL の有無にかかわらず 1 件にまとめ、URL は非 null の値を採る', async () => {
    const t = seedTimeline();
    t.seed.addEmojiReact(t.alice.actorId, t.first.postId, ':x:', 'https://remote.example/emoji/x.png');
    t.seed.addEmojiReact(t.me.actorId, t.first.postId, ':x:', null);
    t.seed.addEmojiReact(t.alice.actorId, t.first.postId, '👍', null);
    t.seed.addEmojiReact(t.me.actorId, t.first.postId, '👍', null);

    const result = await t.resolve({});

    const post = result.ok ? result.val.find((item) => item.post.postId === t.first.postId)?.post : undefined;
    expect(post?.reactions).toEqual([
      { emoji: ':x:', emojiImageUrl: 'https://remote.example/emoji/x.png', count: 2 },
      { emoji: '👍', emojiImageUrl: null, count: 2 },
    ]);
  });
});

describe('createD1LocalPostsResolverByPage', () => {
  it('ローカルの投稿だけを新しい順に返し、閲覧者の状態を入れる', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const mine = t.seed.addLocalPost(me, 1_000);
    t.seed.addLocalPost(me, 2_000, { deletedAt: 3_000 });
    const latest = t.seed.addLocalPost(me, 4_000);
    t.seed.addRemotePost(alice, 5_000);
    t.seed.addLike(me.actorId, mine.postId);

    const result = await createD1LocalPostsResolverByPage(t.db).resolve({
      currentActorId: actorId(me.actorId),
      mutedActorIds: [],
      page: page(),
    });

    expect(result.ok && result.val.map((post) => post.postId)).toEqual([latest.postId, mine.postId]);
    expect(result.ok && result.val.map((post) => post.liked)).toEqual([false, true]);
  });

  it('mutedActorIds のアクターの投稿を除く', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const other = t.seed.addLocalActor('other');
    const mine = t.seed.addLocalPost(me, 1_000);
    t.seed.addLocalPost(other, 2_000);

    const result = await createD1LocalPostsResolverByPage(t.db).resolve({
      currentActorId: actorId(me.actorId),
      mutedActorIds: [actorId(other.actorId)],
      page: page(),
    });

    expect(result.ok && result.val.map((post) => post.postId)).toEqual([mine.postId]);
  });

  it('max_id と min_id でページを分け、削除済みの ID を境界にしても動く', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const a = t.seed.addLocalPost(me, 1_000);
    const deleted = t.seed.addLocalPost(me, 2_000, { deletedAt: 2_500 });
    const b = t.seed.addLocalPost(me, 3_000);
    const c = t.seed.addLocalPost(me, 3_000);
    const resolver = createD1LocalPostsResolverByPage(t.db);

    const older = await resolver.resolve({
      currentActorId: undefined,
      mutedActorIds: [],
      page: page({ olderThanId: deleted.postId }),
    });
    const newer = await resolver.resolve({
      currentActorId: undefined,
      mutedActorIds: [],
      page: page({ newerThanId: a.postId, order: 'oldestFirst', limit: 2 }),
    });

    expect(older.ok && older.val.map((post) => post.postId)).toEqual([a.postId]);
    expect(newer.ok && newer.val.map((post) => post.postId)).toEqual([b.postId, c.postId].sort());
  });
});

describe('createD1FederatedTimelineItemsResolver', () => {
  it('リレーが重複して届けた投稿は 1 件にし、ミュートと削除済みを除く', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const bob = t.seed.addRemoteActor('bob');
    const relayA = t.seed.addRelay();
    const relayB = t.seed.addRelay();
    const note1 = t.seed.addRemotePost(alice, 1_000);
    const note2 = t.seed.addRemotePost(bob, 1_000);
    t.seed.addFederatedItem(note1.postId, relayA, 5_000);
    t.seed.addFederatedItem(note1.postId, relayB, 6_000);
    t.seed.addFederatedItem(note2.postId, relayA, 7_000);
    const resolver = createD1FederatedTimelineItemsResolver(t.db);

    const all = await resolver.resolve({ page: page(), mutedActorIds: [], currentActorId: undefined });
    const muted = await resolver.resolve({
      page: page(),
      mutedActorIds: [actorId(bob.actorId)],
      currentActorId: undefined,
    });
    const afterNote2 = await resolver.resolve({
      page: page({ olderThanId: note2.postId }),
      mutedActorIds: [],
      currentActorId: undefined,
    });

    expect(all.ok && all.val.map(postIdOf)).toEqual([note2.postId, note1.postId]);
    expect(muted.ok && muted.val.map(postIdOf)).toEqual([note1.postId]);
    expect(afterNote2.ok && afterNote2.val.map(postIdOf)).toEqual([note1.postId]);
    expect(afterNote2.ok && afterNote2.val[0]?.receivedAt).toBe(6_000);
  });
});

describe('createD1ThreadResolver', () => {
  it('祖先と子孫をまとめて引き、閲覧者のいいねを入れ、削除済みを除く', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const root = t.seed.addRemotePost(alice, 1_000);
    const mid = t.seed.addLocalPost(me, 2_000, { inReplyToUri: root.uri });
    const reply = t.seed.addRemotePost(alice, 3_000, { inReplyToUri: mid.uri });
    t.seed.addLocalPost(me, 4_000, { inReplyToUri: mid.uri, deletedAt: 4_500 });
    t.seed.addLike(me.actorId, root.postId);
    t.queries.length = 0;

    const result = await createD1ThreadResolver(t.db, SEED_ORIGIN).resolve({
      postId: PostId.orThrow(mid.postId),
      currentActorId: actorId(me.actorId),
    });

    expect(result.ok && result.val.currentPost?.postId).toBe(mid.postId);
    expect(result.ok && result.val.ancestors.map((post) => post.postId)).toEqual([root.postId]);
    expect(result.ok && result.val.ancestors[0]?.liked).toBe(true);
    expect(result.ok && result.val.descendants.map((post) => post.postId)).toEqual([reply.postId]);
    expect(t.queries.length).toBeLessThanOrEqual(14);
  });
});

describe('createD1PostExtrasResolverByPosts', () => {
  it('返信数、返信先、自分のリアクションをまとめて引き、画像の ID は投稿に載る', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const parent = t.seed.addRemotePost(alice, 1_000);
    const post = t.seed.addLocalPost(me, 2_000, { inReplyToUri: parent.uri });
    t.seed.addLocalPost(me, 3_000, { inReplyToUri: post.uri });
    t.seed.addRemotePost(alice, 3_500, { inReplyToUri: post.uri });
    t.seed.addLocalPost(me, 4_000, { inReplyToUri: post.uri, deletedAt: 4_500 });
    const imageId = t.seed.addImage(post.postId, '/uploads/a.png', 'alt');
    t.seed.addEmojiReact(me.actorId, post.postId, '🎉');
    t.seed.addEmojiReact(alice.actorId, post.postId, '👍');
    const posts = await createD1PostsWithAuthorResolverByPostIds(t.db).resolve({
      postIds: [PostId.orThrow(post.postId)],
      currentActorId: actorId(me.actorId),
    });
    const loaded = posts.ok ? [...posts.val.values()] : [];

    const extras = await createD1PostExtrasResolverByPosts(t.db, SEED_ORIGIN).resolve({
      posts: loaded,
      currentActorId: actorId(me.actorId),
    });

    const value = extras.ok ? extras.val.get(PostId.orThrow(post.postId)) : undefined;
    expect(loaded[0]?.images).toEqual([{ imageId, url: '/uploads/a.png', altText: 'alt', mediaType: null }]);
    expect(value).toEqual({
      repliesCount: 2,
      inReplyTo: { postId: parent.postId, actorId: alice.actorId },
      myReactionEmojis: ['🎉'],
      bookmarked: false,
      blueskyCrosspost: null,
      quote: null,
    });
  });

  it('bookmarked は閲覧者自身のブックマークだけを true にし、未ログインでは false にする', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const other = t.seed.addLocalActor('other');
    const alice = t.seed.addRemoteActor('alice');
    const saved = t.seed.addRemotePost(alice, 1_000, { visibility: 'public' });
    const unsaved = t.seed.addRemotePost(alice, 2_000, { visibility: 'public' });
    const savedByOther = t.seed.addRemotePost(alice, 3_000, { visibility: 'public' });
    t.seed.addBookmark(me.actorId, saved.postId, 10_000);
    t.seed.addBookmark(other.actorId, savedByOther.postId, 20_000);
    const posts = await createD1PostsWithAuthorResolverByPostIds(t.db).resolve({
      postIds: [saved, unsaved, savedByOther].map((post) => PostId.orThrow(post.postId)),
      currentActorId: actorId(me.actorId),
    });
    const loaded = posts.ok ? [...posts.val.values()] : [];
    const resolver = createD1PostExtrasResolverByPosts(t.db, SEED_ORIGIN);

    const asMe = await resolver.resolve({ posts: loaded, currentActorId: actorId(me.actorId) });
    const anonymous = await resolver.resolve({ posts: loaded, currentActorId: undefined });

    const flags = (result: typeof asMe) =>
      [saved, unsaved, savedByOther].map((post) =>
        result.ok && result.val.get(PostId.orThrow(post.postId))?.bookmarked
      );
    expect(flags(asMe)).toEqual([true, false, false]);
    expect(flags(anonymous)).toEqual([false, false, false]);
  });

  describe('引用', () => {
    const quoteOf = async (
      t: ReturnType<typeof setup>,
      post: { postId: string },
      currentActorId: ActorId | undefined,
    ) => {
      const posts = await createD1PostsWithAuthorResolverByPostIds(t.db).resolve({
        postIds: [PostId.orThrow(post.postId)],
        currentActorId,
      });
      const loaded = posts.ok ? [...posts.val.values()] : [];
      const extras = await createD1PostExtrasResolverByPosts(t.db, SEED_ORIGIN).resolve({
        posts: loaded,
        currentActorId,
      });
      return extras.ok ? extras.val.get(PostId.orThrow(post.postId))?.quote : undefined;
    };
    const addQuote = (t: ReturnType<typeof setup>, postId: string, quoteUri: string) =>
      t.sqlite.prepare('INSERT INTO post_quotes(postId,quoteUri) VALUES (?,?)').run(postId, quoteUri);

    it('リモートの引用先を remote_posts.uri で引く', async () => {
      const t = setup();
      const me = t.seed.addLocalActor('kosui');
      const alice = t.seed.addRemoteActor('alice');
      const quoted = t.seed.addRemotePost(alice, 1_000, { visibility: 'public' });
      const post = t.seed.addRemotePost(alice, 2_000, { visibility: 'public' });
      addQuote(t, post.postId, quoted.uri);

      const quote = await quoteOf(t, post, actorId(me.actorId));

      expect(quote).toMatchObject({ uri: quoted.uri, post: { postId: quoted.postId } });
    });

    it('ローカル投稿の URI の引用先を投稿 ID で引く', async () => {
      const t = setup();
      const me = t.seed.addLocalActor('kosui');
      const alice = t.seed.addRemoteActor('alice');
      const quoted = t.seed.addLocalPost(me, 1_000);
      const post = t.seed.addRemotePost(alice, 2_000, { visibility: 'public' });
      addQuote(t, post.postId, quoted.uri);

      const quote = await quoteOf(t, post, actorId(me.actorId));

      expect(quote).toMatchObject({ uri: quoted.uri, post: { postId: quoted.postId } });
    });

    it('引用先が未取得、削除済み、見えない投稿のとき post を null にして URI は残す', async () => {
      const t = setup();
      const me = t.seed.addLocalActor('kosui');
      const alice = t.seed.addRemoteActor('alice');
      const deleted = t.seed.addRemotePost(alice, 1_000, { visibility: 'public' });
      t.sqlite.prepare('UPDATE posts SET deletedAt = ? WHERE postId = ?').run(1_500, deleted.postId);
      const hidden = t.seed.addRemotePost(alice, 1_100, { visibility: 'private' });
      const unknownUri = 'https://remote.example/notes/unknown';
      const cases = [deleted.uri, hidden.uri, unknownUri];
      const posts = cases.map((uri, index) => {
        const post = t.seed.addRemotePost(alice, 2_000 + index, { visibility: 'public' });
        addQuote(t, post.postId, uri);
        return post;
      });

      const quotes = await Promise.all(posts.map((post) => quoteOf(t, post, actorId(me.actorId))));

      expect(quotes).toEqual(cases.map((uri) => ({ uri, post: null })));
    });

    it('フォローしている相手のフォロワー限定の引用先は見え、フォローしていなければ見えない', async () => {
      const t = setup();
      const me = t.seed.addLocalActor('kosui');
      const alice = t.seed.addRemoteActor('alice');
      const quoted = t.seed.addRemotePost(alice, 1_000, { visibility: 'private' });
      const post = t.seed.addRemotePost(alice, 2_000, { visibility: 'public' });
      addQuote(t, post.postId, quoted.uri);

      expect((await quoteOf(t, post, actorId(me.actorId)))?.post).toBeNull();
      t.seed.addFollow(me.actorId, alice.actorId);
      expect((await quoteOf(t, post, actorId(me.actorId)))?.post?.postId).toBe(quoted.postId);
    });

    it('閲覧者が無いときは public と unlisted の引用先だけ出す', async () => {
      const t = setup();
      const me = t.seed.addLocalActor('kosui');
      const alice = t.seed.addRemoteActor('alice');
      const targets = {
        public: t.seed.addRemotePost(alice, 1_000, { visibility: 'public' }),
        unlisted: t.seed.addRemotePost(alice, 1_001, { visibility: 'unlisted' }),
        private: t.seed.addRemotePost(alice, 1_002, { visibility: 'private' }),
        direct: t.seed.addRemotePost(alice, 1_003, { visibility: 'direct' }),
        unknown: t.seed.addRemotePost(alice, 1_004, { visibility: null }),
        local: t.seed.addLocalPost(me, 1_005),
      };
      const entries = Object.entries(targets).map(([name, target]) => {
        const post = t.seed.addRemotePost(alice, 2_000, { visibility: 'public' });
        addQuote(t, post.postId, target.uri);
        return { name, post, target };
      });

      const visible = await Promise.all(
        entries.map(async ({ name, post, target }) =>
          [name, (await quoteOf(t, post, undefined))?.post?.postId === target.postId] as const
        ),
      );

      expect(Object.fromEntries(visible)).toEqual({
        public: true,
        unlisted: true,
        private: false,
        direct: false,
        unknown: false,
        local: true,
      });
    });

    it('閲覧者がミュートまたはブロックした相手の引用先は post を null にして URI は残す', async () => {
      const t = setup();
      const me = t.seed.addLocalActor('kosui');
      const alice = t.seed.addRemoteActor('alice');
      const muted = t.seed.addRemoteActor('muted');
      const blocked = t.seed.addRemoteActor('blocked');
      t.seed.addMute(me.userId, muted.actorId);
      t.seed.addBlock(me.userId, blocked.actorId);
      const cases = {
        alice: t.seed.addRemotePost(alice, 1_000, { visibility: 'public' }),
        muted: t.seed.addRemotePost(muted, 1_001, { visibility: 'public' }),
        blocked: t.seed.addRemotePost(blocked, 1_002, { visibility: 'public' }),
      };
      const entries = Object.entries(cases).map(([name, target]) => {
        const post = t.seed.addRemotePost(alice, 2_000, { visibility: 'public' });
        addQuote(t, post.postId, target.uri);
        return { name, post };
      });

      const quotes = await Promise.all(
        entries.map(async ({ name, post }) => {
          const quote = await quoteOf(t, post, actorId(me.actorId));
          return [name, quote?.uri, quote?.post?.postId ?? null] as const;
        }),
      );

      expect(quotes).toEqual([
        ['alice', cases.alice.uri, cases.alice.postId],
        ['muted', cases.muted.uri, null],
        ['blocked', cases.blocked.uri, null],
      ]);
    });

    it('ローカルの URI の形でも、リモート投稿の ID を指していれば引かない', async () => {
      const t = setup();
      const me = t.seed.addLocalActor('kosui');
      const alice = t.seed.addRemoteActor('alice');
      const remote = t.seed.addRemotePost(alice, 1_000, { visibility: 'public' });
      const post = t.seed.addRemotePost(alice, 2_000, { visibility: 'public' });
      addQuote(t, post.postId, `${SEED_ORIGIN}/users/kosui/posts/${remote.postId}`);

      expect((await quoteOf(t, post, actorId(me.actorId)))?.post).toBeNull();
    });
  });

  it('自分のローカル投稿の Bluesky への投稿だけを引く', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const bob = t.seed.addLocalActor('bob');
    const mine = t.seed.addLocalPost(me, 1_000);
    const mineWithoutRow = t.seed.addLocalPost(me, 1_100);
    const theirs = t.seed.addLocalPost(bob, 2_000);
    for (const post of [mine, theirs]) {
      t.sqlite.prepare(
        'INSERT INTO bluesky_crossposts(postId,status,attempts,createdAt,updatedAt) VALUES (?,?,?,?,?)',
      ).run(post.postId, 'failed', 1, 1_000, 1_000);
    }
    const posts = await createD1PostsWithAuthorResolverByPostIds(t.db).resolve({
      postIds: [mine, mineWithoutRow, theirs].map((post) => PostId.orThrow(post.postId)),
      currentActorId: actorId(me.actorId),
    });
    const loaded = posts.ok ? [...posts.val.values()] : [];

    const extras = await createD1PostExtrasResolverByPosts(t.db, SEED_ORIGIN).resolve({
      posts: loaded,
      currentActorId: actorId(me.actorId),
    });

    const crosspostOf = (post: { postId: string }) =>
      extras.ok ? extras.val.get(PostId.orThrow(post.postId))?.blueskyCrosspost : undefined;
    expect(crosspostOf(mine)).toMatchObject({ postId: mine.postId, status: 'failed', attempts: 1 });
    expect(crosspostOf(mineWithoutRow)).toBeNull();
    expect(crosspostOf(theirs)).toBeNull();
  });
});

describe('createD1AccountProfilesResolverByActorIds', () => {
  it('複数のアクターのプロフィールと件数を 1 回でまとめて引く', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    t.seed.addFollow(alice.actorId, me.actorId);
    t.seed.addFollow(me.actorId, alice.actorId);
    t.seed.addLocalPost(me, 1_000);
    t.seed.addLocalPost(me, 3_000);
    t.seed.addRemotePost(alice, 2_000);

    const result = await createD1AccountProfilesResolverByActorIds(t.db).resolve([
      actorId(me.actorId),
      actorId(alice.actorId),
      actorId(t.seed.uuid()),
    ]);

    const profiles = result.ok ? result.val : new Map();
    expect(profiles.size).toBe(2);
    expect(profiles.get(actorId(me.actorId))).toMatchObject({
      type: 'local',
      user: { username: 'kosui' },
      stats: { followersCount: 1, followingCount: 1, statusesCount: 2, lastStatusAt: 3_000 },
    });
    expect(profiles.get(actorId(alice.actorId))).toMatchObject({
      type: 'remote',
      actor: { username: 'alice', url: 'https://remote.example/@alice' },
      stats: { statusesCount: 1 },
    });
  });
});

describe('json_each で ID をまとめて渡す Resolver は 100 件を超えても D1 のバインド上限に当たらない', () => {
  const COUNT = 150;

  it('enrichPostRows は 100 件を超える投稿の行をまとめて処理する', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const posts = Array.from({ length: COUNT }, (_, index) => t.seed.addLocalPost(me, 1_000 + index));
    for (const post of posts) t.seed.addLike(me.actorId, post.postId);
    const rows = await postRowsQuery(t.db);
    t.queries.length = 0;

    const enriched = await enrichPostRows(t.db, rows, actorId(me.actorId));

    expect(enriched).toHaveLength(COUNT);
    expect(enriched.every((post) => post.liked && post.likeCount === 1)).toBe(true);
    expect(Math.max(...t.queries.map((query) => query.params.length))).toBeLessThanOrEqual(100);
  });

  it('createD1PostsWithAuthorResolverByPostIds は 100 件を超える postIds を引ける', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const posts = Array.from({ length: COUNT }, (_, index) => t.seed.addLocalPost(me, 1_000 + index));

    const result = await createD1PostsWithAuthorResolverByPostIds(t.db).resolve({
      postIds: posts.map((post) => PostId.orThrow(post.postId)),
      currentActorId: undefined,
    });

    expect(result.ok ? result.val.size : 0).toBe(COUNT);
  });

  it('createD1AccountProfilesResolverByActorIds は 100 件を超える actorIds を引ける', async () => {
    const t = setup();
    const actors = Array.from({ length: COUNT }, (_, index) => t.seed.addRemoteActor(`user${index}`));
    t.seed.addRemotePost(actors[0], 1_000);

    const result = await createD1AccountProfilesResolverByActorIds(t.db).resolve(
      actors.map((actor) => actorId(actor.actorId)),
    );

    const profiles = result.ok ? result.val : new Map();
    expect(profiles.size).toBe(COUNT);
    expect(profiles.get(actorId(actors[0].actorId))).toMatchObject({ stats: { statusesCount: 1 } });
  });
});

describe('フォロワーとフォロー中の ID の一覧', () => {
  it('actorId の降順で max_id と min_id と limit に従う', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const others = [1, 2, 3].map((n) => t.seed.addRemoteActor(`user${n}`));
    for (const other of others) {
      t.seed.addFollow(other.actorId, me.actorId);
      t.seed.addFollow(me.actorId, other.actorId);
    }
    const ids = others.map((other) => other.actorId).sort().reverse();
    const followers = createD1ActorIdsResolverByFollowingIdWithPagination(t.db);
    const following = createD1ActorIdsResolverByFollowerIdWithPagination(t.db);

    const all = await followers.resolve({ actorId: actorId(me.actorId), page: page({ limit: 2 }) });
    const older = await following.resolve({
      actorId: actorId(me.actorId),
      page: page({ olderThanId: ids[0] }),
    });
    const newer = await followers.resolve({
      actorId: actorId(me.actorId),
      page: page({ newerThanId: ids[2], order: 'oldestFirst', limit: 1 }),
    });

    expect(all.ok && all.val).toEqual(ids.slice(0, 2));
    expect(older.ok && older.val).toEqual(ids.slice(1));
    expect(newer.ok && newer.val).toEqual([ids[1]]);
  });
});
