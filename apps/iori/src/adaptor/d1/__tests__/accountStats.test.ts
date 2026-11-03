import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { createD1AccountStatsResolverByActorId } from '../actor/accountStatsResolverByActorId.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const insertActor = (name: string) => {
    const actorId = crypto.randomUUID();
    fixture.sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
      actorId,
      `https://example.test/users/${name}`,
      `https://example.test/users/${name}/inbox`,
      'remote',
    );
    return actorId;
  };
  const insertPost = (actorId: string, createdAt: number, deletedAt: number | null = null) =>
    fixture.sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type,deletedAt) VALUES (?,?,?,?,?,?)')
      .run(
        crypto.randomUUID(),
        actorId,
        'hello',
        createdAt,
        'local',
        deletedAt,
      );
  const insertFollow = (followerId: string, followingId: string) =>
    fixture.sqlite.prepare('INSERT INTO follows(followerId,followingId) VALUES (?,?)').run(followerId, followingId);
  return { ...fixture, insertActor, insertPost, insertFollow };
};

describe('createD1AccountStatsResolverByActorId', () => {
  it('フォロワー、フォロー、削除されていない投稿を数え、最新の投稿の時刻を返す', async () => {
    const ctx = setup();
    const me = ctx.insertActor('me');
    const other = ctx.insertActor('other');
    const third = ctx.insertActor('third');
    ctx.insertFollow(other, me);
    ctx.insertFollow(third, me);
    ctx.insertFollow(me, other);
    ctx.insertPost(me, 1_000);
    ctx.insertPost(me, 3_000);
    ctx.insertPost(me, 5_000, 6_000);
    ctx.insertPost(other, 9_000);

    const stats = await createD1AccountStatsResolverByActorId(ctx.db).resolve(ActorId.orThrow(me));

    expect(stats.ok && stats.val).toMatchObject({
      followersCount: 2,
      followingCount: 1,
      statusesCount: 2,
      createdAt: 1_000,
      lastStatusAt: 3_000,
    });
  });

  it('作成時のイベントがあれば createdAt にそのイベントの時刻を使う', async () => {
    const ctx = setup();
    const me = ctx.insertActor('me');
    ctx.insertPost(me, 5_000);
    ctx.sqlite.prepare(
      'INSERT INTO domain_events(eventId,aggregateId,aggregateName,aggregateState,eventName,eventPayload,occurredAt) VALUES (?,?,?,?,?,?,?)',
    ).run(crypto.randomUUID(), me, 'actor', null, 'actor.created', '{}', 2_000);

    const stats = await createD1AccountStatsResolverByActorId(ctx.db).resolve(ActorId.orThrow(me));

    expect(stats.ok && stats.val.createdAt).toBe(2_000);
  });

  it('何もなければ 0 件、lastStatusAt は null、createdAt は 0 にする', async () => {
    const ctx = setup();
    const me = ctx.insertActor('me');

    const stats = await createD1AccountStatsResolverByActorId(ctx.db).resolve(ActorId.orThrow(me));

    expect(stats.ok && stats.val).toEqual({
      followersCount: 0,
      followingCount: 0,
      statusesCount: 0,
      createdAt: 0,
      lastStatusAt: null,
    });
  });
});
