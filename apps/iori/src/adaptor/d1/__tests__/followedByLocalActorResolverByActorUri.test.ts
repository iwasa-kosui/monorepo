import { afterEach, describe, expect, it } from 'vitest';

import { createD1FollowedByLocalActorResolverByActorUri } from '../follow/followedByLocalActorResolverByActorUri.ts';
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
});
