import { describe, expect, it } from 'vitest';

import { createMastodonSeed } from '../../adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1ActorResolverByUri } from '../../adaptor/d1/actor/actorResolverByUri.ts';
import { createD1ActorResolverByUserId } from '../../adaptor/d1/actor/actorResolverByUserId.ts';
import { createD1FollowResolver } from '../../adaptor/d1/follow/followResolver.ts';
import { createD1UndoFollowingProcessedStore } from '../../adaptor/d1/follow/undoFollowingProcessedStore.ts';
import { createD1UserResolverByUsername } from '../../adaptor/d1/user/userResolverByUsername.ts';
import { Username } from '../../domain/user/username.ts';
import { AcceptBlockUseCase } from '../acceptBlock.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('kosui');
  const alice = seed.addRemoteActor('alice');
  const bob = seed.addRemoteActor('bob');
  const useCase = AcceptBlockUseCase.create({
    actorResolverByUri: createD1ActorResolverByUri(fixture.db),
    actorResolverByUserId: createD1ActorResolverByUserId(fixture.db),
    userResolverByUsername: createD1UserResolverByUsername(fixture.db),
    followResolver: createD1FollowResolver(fixture.db),
    unfollowedStore: createD1UndoFollowingProcessedStore(fixture.db),
  });
  const follows = () =>
    (fixture.sqlite.prepare('SELECT followerId, followingId FROM follows').all() as Array<
      { followerId: string; followingId: string }
    >).map((row) => [row.followerId, row.followingId]);
  const events = () =>
    Number(
      (fixture.sqlite.prepare(`SELECT COUNT(*) AS n FROM domain_events WHERE eventName='follow.undoFollowingProcessed'`)
        .get() as { n: number | bigint }).n,
    );
  const run = (uri: string) => useCase.run({ username: Username.parseOrThrow('kosui'), blocker: { uri } });
  return { seed, me, alice, bob, useCase, follows, events, run };
};

describe('AcceptBlockUseCase', () => {
  it('送信者から受信ユーザーへのフォローと、受信ユーザーから送信者へのフォローを両方消す', async () => {
    const t = setup();
    t.seed.addFollow(t.alice.actorId, t.me.actorId);
    t.seed.addFollow(t.me.actorId, t.alice.actorId);
    t.seed.addFollow(t.bob.actorId, t.me.actorId);

    const result = await t.run('https://remote.example/users/alice');

    expect(result.ok).toBe(true);
    expect(t.follows()).toEqual([[t.bob.actorId, t.me.actorId]]);
    expect(t.events()).toBe(2);
  });

  it('フォローがなければ何も消さずに成功する', async () => {
    const t = setup();

    const result = await t.run('https://remote.example/users/alice');

    expect(result.ok).toBe(true);
    expect(t.events()).toBe(0);
  });

  it('知らない送信者は ActorNotFoundError にし、知らないユーザーは UserNotFoundError にする', async () => {
    const t = setup();

    const unknownActor = await t.run('https://unknown.example/users/x');
    const unknownUser = await t.useCase.run({
      username: Username.parseOrThrow('nobody'),
      blocker: { uri: 'https://remote.example/users/alice' },
    });

    expect(unknownActor).toMatchObject({ ok: false, err: { type: 'ActorNotFoundError' } });
    expect(unknownUser).toMatchObject({ ok: false, err: { type: 'UserNotFoundError' } });
  });
});
