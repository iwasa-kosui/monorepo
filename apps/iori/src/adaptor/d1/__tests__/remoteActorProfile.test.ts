import { afterEach, describe, expect, it } from 'vitest';

import type { RemoteActor } from '../../../domain/actor/remoteActor.ts';
import { RemoteActor as RemoteActorModel } from '../../../domain/actor/remoteActor.ts';
import { updateRemoteActorProfile } from '../../../domain/actor/updateProfile.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { toAccount } from '../../mastodon/toAccount.ts';
import { createD1AccountProfilesResolverByActorIds } from '../actor/accountProfilesResolverByActorIds.ts';
import { createD1ActorResolverByUri } from '../actor/actorResolverByUri.ts';
import { createD1RemoteActorCreatedStore } from '../actor/remoteActorCreatedStore.ts';
import { createD1RemoteActorProfileUpdatedStore } from '../actor/remoteActorProfileUpdatedStore.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  return fixture;
};

const profile = {
  displayName: 'Alice',
  summary: '<p>hello</p>',
  headerUri: 'https://remote.example/header.png',
  actorType: 'Group' as const,
  manuallyApprovesFollowers: true,
  publishedAt: Date.UTC(2020, 1, 3, 4, 5, 6),
  fields: [{ name: 'Web', value: 'alice.example' }],
  emojis: [{ shortcode: 'blob', url: 'https://remote.example/blob.png' }],
};

const createAlice = async (t: ReturnType<typeof setup>, withProfile: boolean) => {
  const created = RemoteActorModel.createRemoteActor({
    uri: 'https://remote.example/users/alice',
    inboxUrl: 'https://remote.example/users/alice/inbox',
    url: 'https://remote.example/@alice',
    username: 'alice',
    profile: withProfile ? profile : undefined,
  });
  await createD1RemoteActorCreatedStore(t.db).store(created);
  return created.aggregateState;
};

const resolveAlice = async (t: ReturnType<typeof setup>): Promise<RemoteActor> => {
  const result = await createD1ActorResolverByUri(t.db).resolve('https://remote.example/users/alice');
  if (!result.ok || result.val?.type !== 'remote') throw new Error('actor not found');
  return result.val;
};

describe('remote actor profile in D1', () => {
  it('stores the profile on creation and reads it back', async () => {
    const t = setup();
    const alice = await createAlice(t, true);

    expect(await resolveAlice(t)).toEqual({
      id: alice.id,
      uri: 'https://remote.example/users/alice',
      inboxUrl: 'https://remote.example/users/alice/inbox',
      type: 'remote',
      url: 'https://remote.example/@alice',
      username: 'alice',
      logoUri: undefined,
      ...profile,
    });
  });

  it('updates only the given items and records actor.profileUpdated', async () => {
    const t = setup();
    const alice = await createAlice(t, true);

    const event = updateRemoteActorProfile(Instant.now())(alice, { displayName: 'Alicia', summary: null, fields: [] });
    await createD1RemoteActorProfileUpdatedStore(t.db).store(event);

    const actor = await resolveAlice(t);
    expect(actor).toMatchObject({
      displayName: 'Alicia',
      headerUri: profile.headerUri,
      actorType: 'Group',
      manuallyApprovesFollowers: true,
      emojis: profile.emojis,
    });
    expect(actor.summary).toBeUndefined();
    expect(actor.fields).toBeUndefined();
    const events = t.sqlite.prepare('SELECT eventName, aggregateId FROM domain_events WHERE eventName = ?')
      .all('actor.profileUpdated');
    expect(events).toEqual([{ eventName: 'actor.profileUpdated', aggregateId: alice.id }]);
  });

  it('treats broken JSON columns as empty arrays', async () => {
    const t = setup();
    const alice = await createAlice(t, true);
    t.sqlite.prepare('UPDATE remote_actors SET fields = ?, emojis = ? WHERE actorId = ?')
      .run('not json', '[{"shortcode":1}]', alice.id);

    const actor = await resolveAlice(t);
    const profiles = await createD1AccountProfilesResolverByActorIds(t.db).resolve([alice.id]);
    const found = profiles.ok ? profiles.val.get(alice.id) : undefined;
    if (found?.type !== 'remote') throw new Error('remote profile not found');
    const account = toAccount(found, {
      baseUrl: 'https://iori.example/api/v1/accounts/1',
      defaultAvatarUrl: 'https://iori.example/avatar.png',
      defaultHeaderUrl: 'https://iori.example/header.png',
      ...found.stats,
    });

    expect(actor.fields).toBeUndefined();
    expect(actor.emojis).toBeUndefined();
    expect(account.fields).toEqual([]);
    expect(account.emojis).toEqual([]);
  });
});
