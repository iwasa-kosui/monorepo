import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { updateLocalActorProfile } from '../../../domain/actor/updateLocalActorProfile.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1AccountProfilesResolverByActorIds } from '../actor/accountProfilesResolverByActorIds.ts';
import { createD1ActorResolverByUserId } from '../actor/actorResolverByUserId.ts';
import { createD1LocalActorProfileUpdatedStore } from '../actor/localActorProfileUpdatedStore.ts';
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

const resolveMe = async (t: ReturnType<typeof setup>, userId: string) => {
  const result = await createD1ActorResolverByUserId(t.db).resolve(UserId.orThrow(userId));
  if (!result.ok || result.val === undefined) throw new Error('actor not found');
  return result.val;
};

describe('local actor profile in D1', () => {
  it('未設定の actor は displayName と bio が undefined になる', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');

    const actor = await resolveMe(t, me.userId);

    expect(actor.displayName).toBeUndefined();
    expect(actor.bio).toBeUndefined();
  });

  it('保存した表示名と自己紹介を actor と account profile から読み戻し、actor.localProfileUpdated を記録する', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const actor = await resolveMe(t, me.userId);

    const event = updateLocalActorProfile(Instant.now())(actor, { displayName: '岩佐', bio: '自己紹介' });
    await createD1LocalActorProfileUpdatedStore(t.db).store(event);

    expect(await resolveMe(t, me.userId)).toMatchObject({ displayName: '岩佐', bio: '自己紹介' });
    const profiles = await createD1AccountProfilesResolverByActorIds(t.db).resolve([ActorId.orThrow(me.actorId)]);
    const found = profiles.ok ? profiles.val.get(ActorId.orThrow(me.actorId)) : undefined;
    expect(found).toMatchObject({ type: 'local', actor: { displayName: '岩佐', bio: '自己紹介' } });
    const events = t.sqlite.prepare('SELECT eventName, aggregateId FROM domain_events WHERE eventName = ?')
      .all('actor.localProfileUpdated');
    expect(events).toEqual([{ eventName: 'actor.localProfileUpdated', aggregateId: me.actorId }]);
  });

  it('null にした項目は未設定に戻る', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const store = createD1LocalActorProfileUpdatedStore(t.db);
    await store.store(
      updateLocalActorProfile(Instant.now())(await resolveMe(t, me.userId), { displayName: '岩佐', bio: 'x' }),
    );

    await store.store(updateLocalActorProfile(Instant.now())(await resolveMe(t, me.userId), { bio: null }));

    const actor = await resolveMe(t, me.userId);
    expect(actor.displayName).toBe('岩佐');
    expect(actor.bio).toBeUndefined();
  });
});
