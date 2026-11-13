import { describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { UserPreferences } from '../../../domain/userPreferences/userPreferences.ts';
import { createD1UserPreferencesResolverByUserId } from '../userPreferences/userPreferencesResolverByUserId.ts';
import { createD1UserPreferencesSavedStore } from '../userPreferences/userPreferencesSavedStore.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const seed = createMastodonSeed(fixture);
  const me = seed.addLocalActor('me');
  const other = seed.addLocalActor('other');
  return { fixture, db: fixture.db, me, other };
};

const valueOf = <T>(result: { ok: boolean; val?: T }): T => {
  if (!result.ok) throw new Error('unexpected');
  return result.val as T;
};

describe('createD1UserPreferencesResolverByUserId', () => {
  it('行がないときは undefined を返し、他の利用者の行を返さない', async () => {
    const { db, me, other } = setup();
    const store = createD1UserPreferencesSavedStore(db);
    await store.store(
      UserPreferences.save(
        { userId: other.userId as UserId, defaultPostVisibility: 'private' },
        undefined,
        Instant.orThrow(1_000),
      ),
    );

    const resolved = valueOf(await createD1UserPreferencesResolverByUserId(db).resolve(me.userId as UserId));

    expect(resolved).toBeUndefined();
  });
});

describe('createD1UserPreferencesSavedStore', () => {
  it('userId で upsert し、createdAt を保って defaultPostVisibility と updatedAt を更新し、domain event を書く', async () => {
    const { fixture, db, me } = setup();
    const userId = me.userId as UserId;
    const store = createD1UserPreferencesSavedStore(db);
    const first = UserPreferences.save(
      { userId, defaultPostVisibility: 'unlisted' },
      undefined,
      Instant.orThrow(1_000),
    );
    await store.store(first);
    const second = UserPreferences.save(
      { userId, defaultPostVisibility: 'private' },
      first.aggregateState,
      Instant.orThrow(5_000),
    );
    await store.store(second);

    const stored = valueOf(await createD1UserPreferencesResolverByUserId(db).resolve(userId));

    expect(stored).toEqual({ userId, defaultPostVisibility: 'private', createdAt: 1_000, updatedAt: 5_000 });
    expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM user_preferences').get()).toEqual({ n: 1 });
    expect(fixture.sqlite.prepare('SELECT eventName FROM domain_events').all()).toEqual([
      { eventName: 'userPreferences.saved' },
      { eventName: 'userPreferences.saved' },
    ]);
  });
});
