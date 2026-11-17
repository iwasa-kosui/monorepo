import { afterEach, describe, expect, it } from 'vitest';

import { Actor, type LocalActor } from '../../../domain/actor/actor.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1ActorResolverByUserId } from '../actor/actorResolverByUserId.ts';
import { createD1HeaderUriUpdatedStore } from '../actor/headerUriUpdatedStore.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const userId = UserId.orThrow('00000000-0000-4000-8000-000000000001');
const actorId = '00000000-0000-4000-8000-000000000002';

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { sqlite } = fixture;
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(userId, 'kosui');
  sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,logoUri,type) VALUES (?,?,?,?,?)').run(
    actorId,
    'https://blog.test/users/kosui',
    'https://blog.test/users/kosui/inbox',
    'https://blog.test/logo.png',
    'local',
  );
  sqlite.prepare('INSERT INTO local_actors(actorId,userId,displayName) VALUES (?,?,?)').run(actorId, userId, '岩佐');
  return fixture;
};

const resolveActor = async (t: ReturnType<typeof setup>): Promise<LocalActor> => {
  const result = await createD1ActorResolverByUserId(t.db).resolve(userId);
  if (!result.ok || result.val === undefined) throw new Error('actor not found');
  return result.val;
};

describe('local actor header in D1', () => {
  it('ヘッダー画像を保存して読み戻し、未設定に戻せる。ほかの項目は変えない', async () => {
    const t = setup();
    const store = createD1HeaderUriUpdatedStore(t.db);
    const before = await resolveActor(t);

    await store.store(Actor.updateHeaderUri(Instant.now())(before, 'https://blog.test/uploads/h.png'));

    const withHeader = await resolveActor(t);
    expect(withHeader).toEqual({ ...before, headerUri: 'https://blog.test/uploads/h.png' });

    await store.store(Actor.updateHeaderUri(Instant.now())(withHeader, undefined));

    expect((await resolveActor(t)).headerUri).toBeUndefined();
    const events = t.sqlite.prepare('SELECT eventName FROM domain_events WHERE aggregateId = ?').all(actorId);
    expect(events).toHaveLength(2);
  });
});
