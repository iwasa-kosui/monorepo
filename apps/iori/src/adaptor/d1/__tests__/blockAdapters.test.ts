import { describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Block } from '../../../domain/block/block.ts';
import { BlockId } from '../../../domain/block/blockId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { Username } from '../../../domain/user/username.ts';
import { createD1BlockCreatedStore } from '../block/blockCreatedStore.ts';
import { createD1BlockDeletedStore } from '../block/blockDeletedStore.ts';
import { createD1BlockedActorIdsResolverByUserId } from '../block/blockedActorIdsResolverByUserId.ts';
import { createD1BlockedActorsResolverByUserIdWithPagination } from '../block/blockedActorsResolverByUserIdWithPagination.ts';
import { createD1BlockedActorUriResolverByUsername } from '../block/blockedActorUriResolverByUsername.ts';
import { createD1BlockResolver } from '../block/blockResolver.ts';
import { createD1MutedOrBlockedActorIdsResolverByUserId } from '../block/mutedOrBlockedActorIdsResolverByUserId.ts';
import { createD1TimelineLinkTrendsResolverByUserId } from '../linkPreview/timelineLinkTrendsResolverByUserId.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('kosui');
  const other = seed.addLocalActor('other');
  const alice = seed.addRemoteActor('alice');
  const bob = seed.addRemoteActor('bob');
  const count = (table: string, where = '1=1') =>
    Number(
      (fixture.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number | bigint }).n,
    );
  const block = (userId: string, actorId: string, at = 1_000) =>
    Block.createBlock({
      blockId: BlockId.generate(),
      userId: UserId.orThrow(userId),
      blockedActorId: ActorId.orThrow(actorId),
    }, Instant.orThrow(at));
  return { fixture, seed, me, other, alice, bob, count, block };
};

describe('D1 の block の store と resolver', () => {
  it('作成の store が blocks とドメインイベントを同時に保存し、resolver が取り出す', async () => {
    const t = setup();
    const created = t.block(t.me.userId, t.alice.actorId);

    await createD1BlockCreatedStore(t.fixture.db).store(created);

    expect(t.count('blocks')).toBe(1);
    expect(t.count('domain_events', `eventName='block.blockCreated'`)).toBe(1);
    const resolved = await createD1BlockResolver(t.fixture.db).resolve({
      userId: UserId.orThrow(t.me.userId),
      blockedActorId: ActorId.orThrow(t.alice.actorId),
    });
    expect(resolved).toMatchObject({ ok: true, val: created.aggregateState });
    const unresolved = await createD1BlockResolver(t.fixture.db).resolve({
      userId: UserId.orThrow(t.me.userId),
      blockedActorId: ActorId.orThrow(t.bob.actorId),
    });
    expect(unresolved).toMatchObject({ ok: true, val: undefined });
  });

  it('同じ組み合わせを2回保存すると2回目は失敗し、blocks もドメインイベントも1件のまま残る', async () => {
    const t = setup();
    const store = createD1BlockCreatedStore(t.fixture.db);

    await store.store(t.block(t.me.userId, t.alice.actorId));
    await expect(store.store(t.block(t.me.userId, t.alice.actorId))).rejects.toThrow();

    expect(t.count('blocks')).toBe(1);
    expect(t.count('domain_events')).toBe(1);
  });

  it('削除の store が blocks の行を消してドメインイベントを保存する', async () => {
    const t = setup();
    const created = t.block(t.me.userId, t.alice.actorId);
    await createD1BlockCreatedStore(t.fixture.db).store(created);

    await createD1BlockDeletedStore(t.fixture.db).store(
      Block.deleteBlock(created.aggregateState, Instant.orThrow(2_000)),
    );

    expect(t.count('blocks')).toBe(0);
    expect(t.count('domain_events', `eventName='block.blockDeleted'`)).toBe(1);
  });

  it('BlockedActorIdsResolverByUserId は自分のブロックだけを返し、ミュートを含めない', async () => {
    const t = setup();
    t.seed.addBlock(t.me.userId, t.alice.actorId);
    t.seed.addBlock(t.other.userId, t.bob.actorId);
    t.seed.addMute(t.me.userId, t.bob.actorId);

    const resolved = await createD1BlockedActorIdsResolverByUserId(t.fixture.db).resolve(UserId.orThrow(t.me.userId));

    expect(resolved).toMatchObject({ ok: true, val: [t.alice.actorId] });
  });

  it('ミュートとブロックを合わせた resolver は両方を重複なしで返す', async () => {
    const t = setup();
    t.seed.addBlock(t.me.userId, t.alice.actorId);
    t.seed.addMute(t.me.userId, t.alice.actorId);
    t.seed.addMute(t.me.userId, t.bob.actorId);
    t.seed.addBlock(t.other.userId, t.other.actorId);

    const resolved = await createD1MutedOrBlockedActorIdsResolverByUserId(t.fixture.db).resolve(
      UserId.orThrow(t.me.userId),
    );

    expect(resolved.ok && [...resolved.val].sort()).toEqual([t.alice.actorId, t.bob.actorId].sort());
  });

  it('一覧の resolver は新しい順に limit まで返し、他人のブロックの ID を位置にしても時刻を引かない', async () => {
    const t = setup();
    t.seed.addBlock(t.me.userId, t.alice.actorId, 1_000);
    const second = t.seed.addBlock(t.me.userId, t.bob.actorId, 2_000);
    const foreign = t.seed.addBlock(t.other.userId, t.alice.actorId, 3_000);
    const resolver = createD1BlockedActorsResolverByUserIdWithPagination(t.fixture.db);
    const userId = UserId.orThrow(t.me.userId);

    const newest = await resolver.resolve({
      userId,
      page: { limit: 1, olderThanId: undefined, newerThanId: undefined, order: 'newestFirst' },
    });
    const afterForeign = await resolver.resolve({
      userId,
      page: { limit: 10, olderThanId: foreign.blockId, newerThanId: undefined, order: 'newestFirst' },
    });

    expect(newest).toMatchObject({ ok: true, val: [{ blockId: second.blockId, blockedActorId: t.bob.actorId }] });
    expect(afterForeign).toMatchObject({ ok: true, val: [] });
  });

  it('BlockedActorUriResolverByUsername はユーザー名と URI の組みがブロックのときだけ true を返す', async () => {
    const t = setup();
    t.seed.addBlock(t.me.userId, t.alice.actorId);
    const resolver = createD1BlockedActorUriResolverByUsername(t.fixture.db);
    const kosui = Username.parseOrThrow('kosui');
    const other = Username.parseOrThrow('other');

    const [blocked, otherUser, otherActor, unknown] = await Promise.all([
      resolver.resolve({ username: kosui, actorUri: 'https://remote.example/users/alice' }),
      resolver.resolve({ username: other, actorUri: 'https://remote.example/users/alice' }),
      resolver.resolve({ username: kosui, actorUri: 'https://remote.example/users/bob' }),
      resolver.resolve({ username: kosui, actorUri: 'https://unknown.example/users/x' }),
    ]);

    expect([blocked, otherUser, otherActor, unknown]).toMatchObject([
      { ok: true, val: true },
      { ok: true, val: false },
      { ok: true, val: false },
      { ok: true, val: false },
    ]);
  });

  it('ダイジェストのリンク集計はミュートと同様にブロックした相手の投稿を除く', async () => {
    const t = setup();
    t.seed.addFollow(t.me.actorId, t.alice.actorId);
    t.seed.addFollow(t.me.actorId, t.bob.actorId);
    const alicePost = t.seed.addRemotePost(t.alice, 1_000);
    const bobPost = t.seed.addRemotePost(t.bob, 1_100);
    t.seed.addLinkPreview(alicePost.postId, 'https://example.com/alice', null, null);
    t.seed.addLinkPreview(bobPost.postId, 'https://example.com/bob', null, null);
    const resolver = createD1TimelineLinkTrendsResolverByUserId(t.fixture.db);
    const input = { userId: UserId.orThrow(t.me.userId), createdSince: Instant.orThrow(0), limit: 10 };

    const before = await resolver.resolve(input);
    t.seed.addBlock(t.me.userId, t.alice.actorId);
    const after = await resolver.resolve(input);

    expect(before.ok && before.val.map((trend) => trend.url).sort()).toEqual([
      'https://example.com/alice',
      'https://example.com/bob',
    ]);
    expect(after.ok && after.val.map((trend) => trend.url)).toEqual(['https://example.com/bob']);
  });
});
