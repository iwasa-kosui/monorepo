import { Result } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMastodonSeed } from '../../adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1ActorResolverByUserId } from '../../adaptor/d1/actor/actorResolverByUserId.ts';
import { createD1InterestSourceContentChangedStore } from '../../adaptor/d1/interestSource/interestSourceContentChangedStore.ts';
import { createD1InterestSourceCreatedStore } from '../../adaptor/d1/interestSource/interestSourceCreatedStore.ts';
import { createD1InterestSourceDeletedStore } from '../../adaptor/d1/interestSource/interestSourceDeletedStore.ts';
import { createD1InterestSourceEmbeddedStore } from '../../adaptor/d1/interestSource/interestSourceEmbeddedStore.ts';
import { createD1InterestSourcesResolverByUserIdAndKindIncludingDeleted } from '../../adaptor/d1/interestSource/interestSourcesResolverByUserIdAndKindIncludingDeleted.ts';
import { createD1InterestSourcesResolverByUserIdAndKindsPendingEmbedding } from '../../adaptor/d1/interestSource/interestSourcesResolverByUserIdAndKindsPendingEmbedding.ts';
import { createD1LikedPostContentsResolverByLikeIds } from '../../adaptor/d1/interestSource/likedPostContentsResolverByLikeIds.ts';
import { createD1OwnLikeContentsResolverByActorId } from '../../adaptor/d1/interestSource/ownLikeContentsResolverByActorId.ts';
import { createD1OwnPostContentsResolverByActorId } from '../../adaptor/d1/interestSource/ownPostContentsResolverByActorId.ts';
import { createD1PostContentsResolverByPostIds } from '../../adaptor/d1/interestSource/postContentsResolverByPostIds.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { UserId } from '../../domain/user/userId.ts';
import { sha256Hex } from '../../helper/sha256.ts';
import type { TextEmbedder } from '../../ports/textEmbedder.ts';
import { createStubEmbedder } from '../../testing/aiStubs.ts';
import { EmbedOwnInterestSourcesUseCase, OWN_EMBEDDING_BATCH_LIMIT } from '../embedOwnInterestSources.ts';
import { INTEREST_EMBEDDING_MODEL } from '../helper/embedInterestSources.ts';
import { SyncOwnInterestSourcesUseCase } from '../syncOwnInterestSources.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 4, 21, 0));
const POST_AT = Date.UTC(2026, 10, 1);
const LIKE_AT = Date.UTC(2026, 10, 2);

const setup = (options: { textEmbedder?: TextEmbedder | null } = {}) => {
  const fixture = createSqliteD1Fixture();
  const { sqlite, db } = fixture;
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('kosui');
  const friend = seed.addLocalActor('friend');
  const remote = seed.addRemoteActor('someone');
  const userId = me.userId as UserId;
  const stub = createStubEmbedder(1024);
  const stores = {
    interestSourceCreatedStore: createD1InterestSourceCreatedStore(db),
    interestSourceContentChangedStore: createD1InterestSourceContentChangedStore(db),
    interestSourceDeletedStore: createD1InterestSourceDeletedStore(db),
  };
  const sync = SyncOwnInterestSourcesUseCase.create({
    actorResolverByUserId: createD1ActorResolverByUserId(db),
    ownPostContentsResolverByActorId: createD1OwnPostContentsResolverByActorId(db),
    ownLikeContentsResolverByActorId: createD1OwnLikeContentsResolverByActorId(db),
    interestSourcesResolverByUserIdAndKindIncludingDeleted:
      createD1InterestSourcesResolverByUserIdAndKindIncludingDeleted(db),
    ...stores,
    now: () => NOW,
  });
  const buildEmbed = (textEmbedder: TextEmbedder | undefined) =>
    EmbedOwnInterestSourcesUseCase.create({
      interestSourcesResolverByUserIdAndKindsPendingEmbedding:
        createD1InterestSourcesResolverByUserIdAndKindsPendingEmbedding(db),
      postContentsResolverByPostIds: createD1PostContentsResolverByPostIds(db),
      likedPostContentsResolverByLikeIds: createD1LikedPostContentsResolverByLikeIds(db),
      interestSourceEmbeddedStore: createD1InterestSourceEmbeddedStore(db),
      textEmbedder,
      now: () => NOW,
    });
  const embed = buildEmbed(options.textEmbedder === null ? undefined : options.textEmbedder ?? stub.embedder);
  const rows = (kind?: string) =>
    (sqlite.prepare(
      'SELECT kind, ref, contentHash, occurredAt, weight, embeddedAt, deletedAt, length(embedding) AS bytes FROM interest_sources ORDER BY kind, ref',
    ).all() as Array<{
      kind: string;
      ref: string;
      contentHash: string;
      occurredAt: number;
      weight: number;
      embeddedAt: number | null;
      deletedAt: number | null;
      bytes: number | null;
    }>).filter((row) => kind === undefined || row.kind === kind);
  const rowOf = (ref: string) => rows().find((row) => row.ref === ref)!;
  const purgePost = (postId: string) => {
    sqlite.prepare('DELETE FROM likes WHERE postId = ?').run(postId);
    sqlite.prepare('DELETE FROM local_posts WHERE postId = ?').run(postId);
    sqlite.prepare('DELETE FROM remote_posts WHERE postId = ?').run(postId);
    sqlite.prepare('DELETE FROM posts WHERE postId = ?').run(postId);
  };
  const run = { userId };
  return { sqlite, seed, me, friend, remote, userId, stub, sync, embed, buildEmbed, rows, rowOf, purgePost, run };
};

afterEach(() => vi.restoreAllMocks());

describe('SyncOwnInterestSourcesUseCase', () => {
  it('本人の local の投稿と、公開範囲が private、direct でない対象へのいいねを作り、他は作らない', async () => {
    const { seed, me, friend, remote, run, sync, rows, rowOf } = setup();
    const own = seed.addLocalPost(me, POST_AT, { content: '<p>自分の&amp;投稿</p>', timeline: false });
    const softDeleted = seed.addLocalPost(me, POST_AT, { content: '消した投稿', deletedAt: POST_AT, timeline: false });
    const friendPost = seed.addLocalPost(friend, POST_AT, { content: '友達の投稿', timeline: false });
    const publicRemote = seed.addRemotePost(remote, POST_AT, { content: '公開', visibility: 'public' });
    const unknownVisibility = seed.addRemotePost(remote, POST_AT, { content: '宛先不明', visibility: null });
    const privateRemote = seed.addRemotePost(remote, POST_AT, { content: '非公開', visibility: 'private' });
    const directRemote = seed.addRemotePost(remote, POST_AT, { content: 'ダイレクト', visibility: 'direct' });
    const mine = seed.addLike(me.actorId, friendPost.postId, LIKE_AT);
    const likedPublic = seed.addLike(me.actorId, publicRemote.postId, LIKE_AT);
    const likedUnknown = seed.addLike(me.actorId, unknownVisibility.postId, LIKE_AT);
    const likedPrivate = seed.addLike(me.actorId, privateRemote.postId, LIKE_AT);
    const likedDirect = seed.addLike(me.actorId, directRemote.postId, LIKE_AT);
    const likedSoftDeleted = seed.addLike(me.actorId, softDeleted.postId, LIKE_AT);
    const othersLike = seed.addLike(friend.actorId, own.postId, LIKE_AT);

    const result = await sync.run(run);

    expect(result).toEqual({ ok: true, val: { created: 4, changed: 0, deleted: 0 } });
    expect(rows('own_post').map((row) => row.ref)).toEqual([own.postId]);
    expect(rows('own_like').map((row) => row.ref).sort()).toEqual(
      [mine.likeId, likedPublic.likeId, likedUnknown.likeId].sort(),
    );
    const refs = rows().map((row) => row.ref);
    for (const excluded of [softDeleted.postId, friendPost.postId, likedPrivate.likeId, likedDirect.likeId]) {
      expect(refs).not.toContain(excluded);
    }
    expect(refs).not.toContain(likedSoftDeleted.likeId);
    expect(refs).not.toContain(othersLike.likeId);
    expect(rowOf(own.postId)).toMatchObject({
      kind: 'own_post',
      weight: 0.5,
      occurredAt: POST_AT,
      contentHash: await sha256Hex('自分の&投稿'),
      embeddedAt: null,
      bytes: null,
    });
    expect(rowOf(mine.likeId)).toMatchObject({
      kind: 'own_like',
      weight: 0.7,
      occurredAt: LIKE_AT,
      contentHash: await sha256Hex('友達の投稿'),
    });
  });

  it('本文が空の投稿は作らない', async () => {
    const { seed, me, run, sync, rows } = setup();
    seed.addLocalPost(me, POST_AT, { content: '<p> </p>', timeline: false });

    expect(await sync.run(run)).toEqual({ ok: true, val: { created: 0, changed: 0, deleted: 0 } });
    expect(rows()).toEqual([]);
  });

  it('もう一度走らせても何も変えない', async () => {
    const { seed, me, run, sync } = setup();
    const post = seed.addLocalPost(me, POST_AT, { timeline: false });
    seed.addLike(me.actorId, post.postId, LIKE_AT);
    await sync.run(run);

    expect(await sync.run(run)).toEqual({ ok: true, val: { created: 0, changed: 0, deleted: 0 } });
  });

  it('作る行が多くても全件書く', async () => {
    const { seed, me, run, sync, rows } = setup();
    for (let i = 0; i < 25; i += 1) seed.addLocalPost(me, POST_AT + i, { content: `投稿 ${i}`, timeline: false });

    expect(await sync.run(run)).toEqual({ ok: true, val: { created: 25, changed: 0, deleted: 0 } });
    expect(rows('own_post')).toHaveLength(25);
  });

  it('本文が変わった投稿は changed にして埋め込みを消す', async () => {
    const { sqlite, seed, me, run, sync, embed, rowOf } = setup();
    const post = seed.addLocalPost(me, POST_AT, { content: '前', timeline: false });
    await sync.run(run);
    await embed.run(run);
    expect(rowOf(post.postId).embeddedAt).toBe(NOW);
    sqlite.prepare('UPDATE posts SET content = ? WHERE postId = ?').run('後', post.postId);

    expect(await sync.run(run)).toEqual({ ok: true, val: { created: 0, changed: 1, deleted: 0 } });

    expect(rowOf(post.postId)).toMatchObject({
      contentHash: await sha256Hex('後'),
      embeddedAt: null,
      bytes: null,
    });
  });

  it('物理削除された投稿といいね、論理削除された投稿、private になった対象のいいねは deleted にする', async () => {
    const { sqlite, seed, me, remote, run, sync, purgePost, rowOf } = setup();
    const purged = seed.addLocalPost(me, POST_AT, { content: '消える投稿', timeline: false });
    const soft = seed.addLocalPost(me, POST_AT, { content: '論理削除', timeline: false });
    const kept = seed.addLocalPost(me, POST_AT, { content: '残る', timeline: false });
    const target = seed.addRemotePost(remote, POST_AT, { content: '相手の投稿', visibility: 'public' });
    const goesPrivate = seed.addRemotePost(remote, POST_AT, { content: 'あとで非公開', visibility: 'public' });
    const unliked = seed.addLike(me.actorId, target.postId, LIKE_AT);
    const privateLater = seed.addLike(me.actorId, goesPrivate.postId, LIKE_AT);
    const keptLike = seed.addLike(me.actorId, kept.postId, LIKE_AT);
    await sync.run(run);
    purgePost(purged.postId);
    sqlite.prepare('UPDATE posts SET deletedAt = ? WHERE postId = ?').run(NOW, soft.postId);
    sqlite.prepare('DELETE FROM likes WHERE likeId = ?').run(unliked.likeId);
    sqlite.prepare('UPDATE remote_posts SET visibility = ? WHERE postId = ?').run('direct', goesPrivate.postId);

    expect(await sync.run(run)).toEqual({ ok: true, val: { created: 0, changed: 0, deleted: 4 } });

    for (const ref of [purged.postId, soft.postId, unliked.likeId, privateLater.likeId]) {
      expect(rowOf(ref).deletedAt).toBe(NOW);
    }
    expect(rowOf(kept.postId).deletedAt).toBeNull();
    expect(rowOf(keptLike.likeId).deletedAt).toBeNull();
  });

  it('削除済みの行の投稿が戻ったら、一意制約に当たらず復活させる', async () => {
    const { sqlite, seed, me, run, sync, rowOf, rows } = setup();
    const post = seed.addLocalPost(me, POST_AT, { content: '一度消す', deletedAt: null, timeline: false });
    await sync.run(run);
    sqlite.prepare('UPDATE posts SET deletedAt = ? WHERE postId = ?').run(NOW, post.postId);
    await sync.run(run);
    expect(rowOf(post.postId).deletedAt).toBe(NOW);
    sqlite.prepare('UPDATE posts SET deletedAt = NULL WHERE postId = ?').run(post.postId);

    expect(await sync.run(run)).toEqual({ ok: true, val: { created: 0, changed: 1, deleted: 0 } });

    expect(rowOf(post.postId)).toMatchObject({ deletedAt: null, embeddedAt: null });
    expect(rows('own_post')).toHaveLength(1);
  });

  it('本人の actor が無ければ UserNotFoundError を返す', async () => {
    const { sync } = setup();
    const stranger = UserId.generate();

    expect(await sync.run({ userId: stranger })).toMatchObject({
      ok: false,
      err: { type: 'UserNotFoundError', detail: { userId: stranger } },
    });
  });
});

describe('EmbedOwnInterestSourcesUseCase', () => {
  it('ref から文字列を作り直し、まとめて 1 回 embed して書く', async () => {
    const { seed, me, friend, run, sync, embed, stub, rows, rowOf } = setup();
    const post = seed.addLocalPost(me, POST_AT, { content: '<p>自分の投稿</p>', timeline: false });
    const friendPost = seed.addLocalPost(friend, POST_AT, { content: '友達の投稿', timeline: false });
    const like = seed.addLike(me.actorId, friendPost.postId, LIKE_AT);
    await sync.run(run);

    const result = await embed.run(run);

    expect(result).toEqual({ ok: true, val: { embedded: 2, skipped: 0 } });
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.model).toBe(INTEREST_EMBEDDING_MODEL);
    expect([...(stub.calls[0]?.texts ?? [])].sort()).toEqual(['友達の投稿', '自分の投稿']);
    expect(rowOf(post.postId)).toMatchObject({ embeddedAt: NOW, bytes: 4096 });
    expect(rowOf(like.likeId)).toMatchObject({ embeddedAt: NOW, bytes: 4096 });
    expect(rows().every((row) => row.embeddedAt === NOW)).toBe(true);

    expect(await embed.run(run)).toEqual({ ok: true, val: { embedded: 0, skipped: 0 } });
    expect(stub.calls).toHaveLength(1);
  });

  it('1 回に 100 件までしか読まず、残りは次の回で埋め込む', async () => {
    const { seed, me, run, sync, embed, stub, rows } = setup();
    for (let i = 0; i < 120; i += 1) seed.addLocalPost(me, POST_AT + i, { content: `投稿 ${i}`, timeline: false });
    await sync.run(run);

    expect(await embed.run(run)).toEqual({ ok: true, val: { embedded: OWN_EMBEDDING_BATCH_LIMIT, skipped: 0 } });
    expect(stub.calls[0]?.texts).toHaveLength(100);
    expect(rows().filter((row) => row.embeddedAt === null)).toHaveLength(20);

    expect(await embed.run(run)).toEqual({ ok: true, val: { embedded: 20, skipped: 0 } });
  });

  it('次元が 1024 でないベクトルは書かず、error ログを出して他は続ける', async () => {
    const mixed: TextEmbedder = {
      embed: async ({ texts }) =>
        Result.ok(texts.map((text, i) => Array.from({ length: i === 1 ? 512 : 1024 }, () => text.length))),
    };
    const { seed, me, run, sync, buildEmbed, rows } = setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (let i = 0; i < 3; i += 1) seed.addLocalPost(me, POST_AT + i, { content: `投稿 ${i}`, timeline: false });
    await sync.run(run);

    expect(await buildEmbed(mixed).run(run)).toEqual({ ok: true, val: { embedded: 2, skipped: 1 } });

    expect(error).toHaveBeenCalledWith(
      'iori interest sources: the embedding was not stored.',
      expect.objectContaining({ kind: 'own_post', message: expect.stringContaining('1024') }),
    );
    expect(rows().filter((row) => row.embeddedAt === null)).toHaveLength(1);
  });

  it('対象の投稿が無い行と、contentHash が合わない行は飛ばして、行を変えない', async () => {
    const { sqlite, seed, me, remote, run, sync, embed, stub, purgePost, rowOf } = setup();
    const purged = seed.addLocalPost(me, POST_AT, { content: '消える', timeline: false });
    const edited = seed.addLocalPost(me, POST_AT, { content: '編集前', timeline: false });
    const unchanged = seed.addLocalPost(me, POST_AT, { content: '変わらない', timeline: false });
    const target = seed.addRemotePost(remote, POST_AT, { content: '相手', visibility: 'public' });
    const like = seed.addLike(me.actorId, target.postId, LIKE_AT);
    await sync.run(run);
    purgePost(purged.postId);
    sqlite.prepare('UPDATE posts SET content = ? WHERE postId = ?').run('編集後', edited.postId);
    sqlite.prepare('UPDATE remote_posts SET visibility = ? WHERE postId = ?').run('private', target.postId);

    expect(await embed.run(run)).toEqual({ ok: true, val: { embedded: 1, skipped: 3 } });

    expect(stub.calls[0]?.texts).toEqual(['変わらない']);
    expect(rowOf(unchanged.postId).embeddedAt).toBe(NOW);
    for (const ref of [purged.postId, edited.postId, like.likeId]) {
      expect(rowOf(ref)).toMatchObject({ embeddedAt: null, bytes: null, deletedAt: null });
    }
  });

  it('kosui_* の行は対象にしない', async () => {
    const { sqlite, userId, embed, stub } = setup();
    sqlite.prepare(
      'INSERT INTO interest_sources(interestSourceId,userId,kind,ref,contentHash,weight,occurredAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(
      '00000000-0000-4000-8000-0000000000aa',
      userId,
      'kosui_post',
      'https://kosui.me/a',
      'a'.repeat(64),
      1,
      1,
      1,
      1,
    );

    expect(await embed.run({ userId })).toEqual({ ok: true, val: { embedded: 0, skipped: 0 } });
    expect(stub.calls).toEqual([]);
  });

  it('埋め込み器が無ければ何もしない', async () => {
    const { seed, me, run, sync, embed, rows } = setup({ textEmbedder: null });
    seed.addLocalPost(me, POST_AT, { timeline: false });
    await sync.run(run);

    expect(await embed.run(run)).toEqual({ ok: true, val: { embedded: 0, skipped: 0 } });
    expect(rows().every((row) => row.embeddedAt === null)).toBe(true);
  });

  it('埋め込みが失敗したら AiError を返し、行を変えない', async () => {
    const failing: TextEmbedder = {
      embed: async () => Result.err({ type: 'AiError', message: 'unavailable' }),
    };
    const { seed, me, run, sync, buildEmbed, rows } = setup();
    seed.addLocalPost(me, POST_AT, { timeline: false });
    await sync.run(run);

    expect(await buildEmbed(failing).run(run)).toEqual({
      ok: false,
      err: { type: 'AiError', message: 'unavailable' },
    });
    expect(rows().every((row) => row.embeddedAt === null)).toBe(true);
  });
});
