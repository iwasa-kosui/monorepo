import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { HOME_POSTS_BY_PERIOD_LIMIT } from '../../../domain/timeline/homePostsResolverByPeriod.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1AiSummaryUsageRecorder } from '../aiSummary/aiSummaryUsageRecorder.ts';
import { createD1HomePostsResolverByPeriod } from '../timeline/homePostsResolverByPeriod.ts';
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

const instant = (value: number) => Instant.orThrow(value);

describe('createD1HomePostsResolverByPeriod', () => {
  it('渡した actorId の投稿だけを新しい順に返す', async () => {
    const { db, seed } = setup();
    const me = seed.addLocalActor('kosui');
    const alice = seed.addRemoteActor('alice');
    const bob = seed.addRemoteActor('bob');
    seed.addFollow(me.actorId, alice.actorId);
    const mine = seed.addLocalPost(me, 1_000);
    const fromAlice = seed.addRemotePost(alice, 3_000);
    seed.addRemotePost(bob, 2_000);

    const result = await createD1HomePostsResolverByPeriod(db).resolve({
      actorIds: [ActorId.orThrow(me.actorId), ActorId.orThrow(alice.actorId)],
      currentActorId: ActorId.orThrow(me.actorId),
      since: instant(0),
      until: instant(10_000),
    });

    expect(result).toEqual({ ok: true, val: [fromAlice.postId, mine.postId] });
  });

  it('actorId が空なら空の配列を返す', async () => {
    const { db, seed } = setup();
    const me = seed.addLocalActor('kosui');
    seed.addLocalPost(me, 1_000);

    const result = await createD1HomePostsResolverByPeriod(db).resolve({
      actorIds: [],
      currentActorId: ActorId.orThrow(me.actorId),
      since: instant(0),
      until: instant(10_000),
    });

    expect(result).toEqual({ ok: true, val: [] });
  });

  it('ミュートで除いた actorId の投稿は返さない', async () => {
    const { db, seed } = setup();
    const me = seed.addLocalActor('kosui');
    const alice = seed.addRemoteActor('alice');
    const carol = seed.addRemoteActor('carol');
    seed.addFollow(me.actorId, alice.actorId);
    seed.addFollow(me.actorId, carol.actorId);
    seed.addMute(me.userId, carol.actorId);
    const fromAlice = seed.addRemotePost(alice, 2_000);
    seed.addRemotePost(carol, 3_000);

    const result = await createD1HomePostsResolverByPeriod(db).resolve({
      actorIds: [ActorId.orThrow(alice.actorId)],
      currentActorId: ActorId.orThrow(me.actorId),
      since: instant(0),
      until: instant(10_000),
    });

    expect(result).toEqual({ ok: true, val: [fromAlice.postId] });
  });

  it('削除済みの投稿は返さない', async () => {
    const { db, seed } = setup();
    const me = seed.addLocalActor('kosui');
    const alive = seed.addLocalPost(me, 1_000);
    seed.addLocalPost(me, 2_000, { deletedAt: 3_000 });

    const result = await createD1HomePostsResolverByPeriod(db).resolve({
      actorIds: [ActorId.orThrow(me.actorId)],
      currentActorId: ActorId.orThrow(me.actorId),
      since: instant(0),
      until: instant(10_000),
    });

    expect(result).toEqual({ ok: true, val: [alive.postId] });
  });

  it('since は含み、until は含まない', async () => {
    const { db, seed } = setup();
    const me = seed.addLocalActor('kosui');
    seed.addLocalPost(me, 999);
    const atSince = seed.addLocalPost(me, 1_000);
    const beforeUntil = seed.addLocalPost(me, 1_999);
    seed.addLocalPost(me, 2_000);

    const result = await createD1HomePostsResolverByPeriod(db).resolve({
      actorIds: [ActorId.orThrow(me.actorId)],
      currentActorId: ActorId.orThrow(me.actorId),
      since: instant(1_000),
      until: instant(2_000),
    });

    expect(result).toEqual({ ok: true, val: [beforeUntil.postId, atSince.postId] });
  });

  it('リポストは含めない', async () => {
    const { db, seed } = setup();
    const me = seed.addLocalActor('kosui');
    const alice = seed.addRemoteActor('alice');
    const original = seed.addRemotePost(alice, 1_000);
    seed.addRepost(me.actorId, original.postId, 2_000);

    const result = await createD1HomePostsResolverByPeriod(db).resolve({
      actorIds: [ActorId.orThrow(me.actorId)],
      currentActorId: ActorId.orThrow(me.actorId),
      since: instant(0),
      until: instant(10_000),
    });

    expect(result).toEqual({ ok: true, val: [] });
  });

  it('同じ時刻の投稿は postId の降順で返す', async () => {
    const { db, seed } = setup();
    const me = seed.addLocalActor('kosui');
    const first = seed.addLocalPost(me, 1_000);
    const second = seed.addLocalPost(me, 1_000);

    const result = await createD1HomePostsResolverByPeriod(db).resolve({
      actorIds: [ActorId.orThrow(me.actorId)],
      currentActorId: ActorId.orThrow(me.actorId),
      since: instant(0),
      until: instant(10_000),
    });

    expect(result).toEqual({ ok: true, val: [second.postId, first.postId] });
  });

  it('宛先外の direct は返さず、宛先の direct は返す', async () => {
    const { db, seed } = setup();
    const me = seed.addLocalActor('kosui');
    const alice = seed.addRemoteActor('alice');
    seed.addFollow(me.actorId, alice.actorId);
    const toMe = seed.addRemotePost(alice, 1_000, {
      visibility: 'direct',
      recipientActorUris: [`${SEED_ORIGIN}/users/kosui`],
    });
    seed.addRemotePost(alice, 2_000, {
      visibility: 'direct',
      recipientActorUris: ['https://remote.example/users/other'],
    });

    const result = await createD1HomePostsResolverByPeriod(db).resolve({
      actorIds: [ActorId.orThrow(me.actorId), ActorId.orThrow(alice.actorId)],
      currentActorId: ActorId.orThrow(me.actorId),
      since: instant(0),
      until: instant(10_000),
    });

    expect(result).toEqual({ ok: true, val: [toMe.postId] });
  });

  it('最大 300 件の新しい投稿だけを返す', async () => {
    const { db, seed } = setup();
    const me = seed.addLocalActor('kosui');
    const posts = Array.from(
      { length: HOME_POSTS_BY_PERIOD_LIMIT + 1 },
      (_, index) => seed.addLocalPost(me, 1_000 + index, { timeline: false }),
    );

    const result = await createD1HomePostsResolverByPeriod(db).resolve({
      actorIds: [ActorId.orThrow(me.actorId)],
      currentActorId: ActorId.orThrow(me.actorId),
      since: instant(0),
      until: instant(100_000),
    });

    expect(HOME_POSTS_BY_PERIOD_LIMIT).toBe(300);
    expect(result.ok && result.val).toHaveLength(300);
    expect(result.ok && result.val[0]).toBe(posts.at(-1)!.postId);
    expect(result.ok && result.val).not.toContain(posts[0]!.postId);
  });
});

describe('createD1AiSummaryUsageRecorder', () => {
  const reserveMany = async (
    recorder: ReturnType<typeof createD1AiSummaryUsageRecorder>,
    userId: UserId,
    day: string,
    times: number,
  ) => {
    const results = [];
    for (let i = 0; i < times; i++) results.push(await recorder.reserve({ userId, day, limit: 20 }));
    return results;
  };

  it('20 回目まで許可し、21 回目は許可せず count は 20 のままにする', async () => {
    const { db, sqlite, seed } = setup();
    const me = seed.addLocalActor('kosui');
    const userId = UserId.orThrow(me.userId);
    const recorder = createD1AiSummaryUsageRecorder(db);

    const results = await reserveMany(recorder, userId, '2026-11-04', 21);

    expect(results.slice(0, 20).every((result) => result.ok && result.val.allowed)).toBe(true);
    expect(results.slice(0, 20).map((result) => result.ok && result.val.count)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(results[20]).toEqual({ ok: true, val: { allowed: false, count: 20 } });
    expect(
      sqlite.prepare('SELECT count FROM ai_summary_usages WHERE userId = ? AND day = ?').get(
        userId,
        '2026-11-04',
      ),
    ).toEqual({ count: 20 });
  });

  it('日付が変わると 1 から数え直す', async () => {
    const { db, seed } = setup();
    const me = seed.addLocalActor('kosui');
    const userId = UserId.orThrow(me.userId);
    const recorder = createD1AiSummaryUsageRecorder(db);
    await reserveMany(recorder, userId, '2026-11-04', 20);

    const nextDay = await recorder.reserve({ userId, day: '2026-11-05', limit: 20 });

    expect(nextDay).toEqual({ ok: true, val: { allowed: true, count: 1 } });
  });

  it('利用者ごとに数える', async () => {
    const { db, seed } = setup();
    const kosui = seed.addLocalActor('kosui');
    const alice = seed.addLocalActor('alice');
    const recorder = createD1AiSummaryUsageRecorder(db);
    await reserveMany(recorder, UserId.orThrow(kosui.userId), '2026-11-04', 20);

    const result = await recorder.reserve({ userId: UserId.orThrow(alice.userId), day: '2026-11-04', limit: 20 });

    expect(result).toEqual({ ok: true, val: { allowed: true, count: 1 } });
  });

  it('read はその日の回数を返し、行がなければ 0 を返す', async () => {
    const { db, seed } = setup();
    const me = seed.addLocalActor('kosui');
    const userId = UserId.orThrow(me.userId);
    const recorder = createD1AiSummaryUsageRecorder(db);
    await reserveMany(recorder, userId, '2026-11-04', 3);

    expect(await recorder.read({ userId, day: '2026-11-04' })).toEqual({ ok: true, val: 3 });
    expect(await recorder.read({ userId, day: '2026-11-05' })).toEqual({ ok: true, val: 0 });
  });
});
