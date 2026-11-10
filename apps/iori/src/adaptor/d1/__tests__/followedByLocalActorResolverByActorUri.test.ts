import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Follow } from '../../../domain/follow/follow.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { createD1FollowedByLocalActorResolverByActorUri } from '../follow/followedByLocalActorResolverByActorUri.ts';
import { createD1FollowRequestedStore } from '../follow/followRequestedStore.ts';
import { createD1UndoFollowingProcessedStore } from '../follow/undoFollowingProcessedStore.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
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

describe('createD1FollowedByLocalActorResolverByActorUri', () => {
  it('ローカルの actor がフォローしている actor の URI なら true を返す', async () => {
    const t = setup();
    const kosui = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    t.seed.addFollow(kosui.actorId, alice.actorId);

    const result = await createD1FollowedByLocalActorResolverByActorUri(t.db).resolve({
      actorUri: 'https://remote.example/users/alice',
    });

    expect(result).toEqual({ ok: true, val: true });
  });

  it('どのローカルの actor もフォローしていない actor の URI なら false を返す', async () => {
    const t = setup();
    const kosui = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    t.seed.addRemoteActor('bob');
    t.seed.addFollow(kosui.actorId, alice.actorId);

    const result = await createD1FollowedByLocalActorResolverByActorUri(t.db).resolve({
      actorUri: 'https://remote.example/users/bob',
    });

    expect(result).toEqual({ ok: true, val: false });
  });

  it('リモートの actor からのフォローだけなら false を返す', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const bob = t.seed.addRemoteActor('bob');
    t.seed.addFollow(bob.actorId, alice.actorId);

    const result = await createD1FollowedByLocalActorResolverByActorUri(t.db).resolve({
      actorUri: 'https://remote.example/users/alice',
    });

    expect(result).toEqual({ ok: true, val: false });
  });

  it('actors に未登録の URI なら false を返す', async () => {
    const t = setup();
    t.seed.addLocalActor('kosui');

    const result = await createD1FollowedByLocalActorResolverByActorUri(t.db).resolve({
      actorUri: 'https://unknown.example/users/carol',
    });

    expect(result).toEqual({ ok: true, val: false });
  });

  it('ローカルの actor が FollowRequestedStore でフォローを申請した直後に true を返す', async () => {
    const t = setup();
    const kosui = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');

    await createD1FollowRequestedStore(t.db).store(
      Follow.requestFollow(
        { followerId: ActorId.orThrow(kosui.actorId), followingId: ActorId.orThrow(alice.actorId) },
        Instant.now(),
      ),
    );
    const result = await createD1FollowedByLocalActorResolverByActorUri(t.db).resolve({
      actorUri: 'https://remote.example/users/alice',
    });

    expect(result).toEqual({ ok: true, val: true });
  });

  it('UndoFollowingProcessedStore でフォローを解除した後は false を返す', async () => {
    const t = setup();
    const kosui = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const follow = { followerId: ActorId.orThrow(kosui.actorId), followingId: ActorId.orThrow(alice.actorId) };

    await createD1FollowRequestedStore(t.db).store(Follow.requestFollow(follow, Instant.now()));
    await createD1UndoFollowingProcessedStore(t.db).store(Follow.undoFollow(follow, Instant.now()));
    const result = await createD1FollowedByLocalActorResolverByActorUri(t.db).resolve({
      actorUri: 'https://remote.example/users/alice',
    });

    expect(result).toEqual({ ok: true, val: false });
  });
});
