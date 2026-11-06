import { Accept, Follow as ApFollow } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Follow } from '../../../domain/follow/follow.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { createOnAccept } from '../../fedify/inboxListener/onAccept.ts';
import { createD1ActorResolverByUri } from '../actor/actorResolverByUri.ts';
import { createD1FollowAcceptedStore } from '../follow/followAcceptedStore.ts';
import { createD1FollowRequestedStore } from '../follow/followRequestedStore.ts';
import { createD1FollowResolver } from '../follow/followResolver.ts';
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

const countRows = (t: ReturnType<typeof setup>, table: string) =>
  Number((t.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number | bigint }).n);

const countFollowAcceptedEvents = (t: ReturnType<typeof setup>) =>
  Number(
    (t.sqlite.prepare(`SELECT count(*) AS n FROM domain_events WHERE eventName = 'follow.followAccepted'`).get() as {
      n: number | bigint;
    }).n,
  );

describe('createD1FollowAcceptedStore', () => {
  it('フォローの申請で行がすでにあっても Accept を保存できる', async () => {
    const t = setup();
    const kosui = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const follow = { followerId: ActorId.orThrow(kosui.actorId), followingId: ActorId.orThrow(alice.actorId) };
    await createD1FollowRequestedStore(t.db).store(Follow.requestFollow(follow, Instant.now()));

    await createD1FollowAcceptedStore(t.db).store(Follow.acceptFollow(follow, Instant.now()));

    expect(countRows(t, 'follows')).toBe(1);
  });

  it('同じ Accept を2回保存しても例外にならず、行は1つのままになる', async () => {
    const t = setup();
    const kosui = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const follow = { followerId: ActorId.orThrow(kosui.actorId), followingId: ActorId.orThrow(alice.actorId) };
    await createD1FollowRequestedStore(t.db).store(Follow.requestFollow(follow, Instant.now()));
    const store = createD1FollowAcceptedStore(t.db);

    await store.store(Follow.acceptFollow(follow, Instant.now()));
    await store.store(Follow.acceptFollow(follow, Instant.now()));

    expect(countRows(t, 'follows')).toBe(1);
  });

  it('行がまだ無ければ行とドメインイベントを作る', async () => {
    const t = setup();
    const kosui = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const follow = { followerId: ActorId.orThrow(alice.actorId), followingId: ActorId.orThrow(kosui.actorId) };

    await createD1FollowAcceptedStore(t.db).store(Follow.acceptFollow(follow, Instant.now()));

    expect(countRows(t, 'follows')).toBe(1);
    expect(countFollowAcceptedEvents(t)).toBe(1);
  });
});

describe('createOnAccept with the D1 stores', () => {
  const ORIGIN = 'https://iori.test';
  const setupAccept = async () => {
    const t = setup();
    const kosui = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const follow = { followerId: ActorId.orThrow(kosui.actorId), followingId: ActorId.orThrow(alice.actorId) };
    await createD1FollowRequestedStore(t.db).store(Follow.requestFollow(follow, Instant.now()));
    const deps = {
      origin: ORIGIN,
      relayResolverByActorUri: { resolve: vi.fn(async () => RA.ok(undefined)) },
      inboxActorResolver: {
        resolve: vi.fn(async () => RA.ok({ actorIdentity: { uri: 'https://remote.example/users/alice' } })),
      },
      acceptRelaySubscriptionUseCase: { run: vi.fn() },
      actorResolverByUri: createD1ActorResolverByUri(t.db),
      followResolver: createD1FollowResolver(t.db),
      followAcceptedStore: createD1FollowAcceptedStore(t.db),
    };
    const ctx = { getActorUri: vi.fn(() => new URL(`${ORIGIN}/users/instance`)) } as never;
    const accept = new Accept({
      id: new URL('https://remote.example/activities/1'),
      actor: new URL('https://remote.example/users/alice'),
      object: new ApFollow({
        id: new URL(`${ORIGIN}/follows/1`),
        actor: new URL(`${ORIGIN}/users/kosui`),
        object: new URL('https://remote.example/users/alice'),
      }),
    });
    return { t, deps: deps as never, ctx, accept };
  };

  it('申請済みのフォローへの Accept を処理しても例外にならない', async () => {
    const { t, deps, ctx, accept } = await setupAccept();

    await expect(createOnAccept(deps)(ctx, accept)).resolves.toBeUndefined();

    expect(countRows(t, 'follows')).toBe(1);
  });

  it('同じ Accept を再試行しても例外にならず、行は1つのままになる', async () => {
    const { t, deps, ctx, accept } = await setupAccept();

    await createOnAccept(deps)(ctx, accept);
    await expect(createOnAccept(deps)(ctx, accept)).resolves.toBeUndefined();

    expect(countRows(t, 'follows')).toBe(1);
  });
});
