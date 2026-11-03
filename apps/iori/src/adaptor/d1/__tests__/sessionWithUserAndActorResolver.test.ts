import { afterEach, describe, expect, it } from 'vitest';

import { createD1SessionWithUserAndActorResolver } from '../session/sessionWithUserAndActorResolver.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const userId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';
const sessionId = '00000000-0000-4000-8000-000000000003';

const setup = (rows: Readonly<{ user: boolean; actor: boolean; expires: number }>) => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { sqlite } = fixture;
  sqlite.exec('PRAGMA foreign_keys=OFF');
  if (rows.user) {
    sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(userId, 'kosui');
  }
  if (rows.actor) {
    sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,logoUri,type) VALUES (?,?,?,?,?)').run(
      actorId,
      'https://blog.test/users/kosui',
      'https://blog.test/users/kosui/inbox',
      'https://blog.test/logo.png',
      'local',
    );
    sqlite.prepare('INSERT INTO local_actors(actorId,userId) VALUES (?,?)').run(actorId, userId);
  }
  sqlite.prepare('INSERT INTO sessions(sessionId,userId,expires) VALUES (?,?,?)').run(sessionId, userId, rows.expires);
  return fixture;
};

describe('createD1SessionWithUserAndActorResolver', () => {
  it('resolves the session, user, and local actor in one query', async () => {
    const { db, queries } = setup({ user: true, actor: true, expires: 4_000_000_000_000 });

    const result = await createD1SessionWithUserAndActorResolver(db).resolve(sessionId as never);

    expect(result).toEqual({
      ok: true,
      val: {
        session: { sessionId, userId, expires: 4_000_000_000_000 },
        user: { id: userId, username: 'kosui' },
        actor: {
          id: actorId,
          uri: 'https://blog.test/users/kosui',
          inboxUrl: 'https://blog.test/users/kosui/inbox',
          type: 'local',
          userId,
          logoUri: 'https://blog.test/logo.png',
        },
      },
      err: undefined,
    });
    expect(queries).toHaveLength(1);
  });

  it('returns undefined when the session does not exist', async () => {
    const { db } = setup({ user: true, actor: true, expires: 4_000_000_000_000 });

    const result = await createD1SessionWithUserAndActorResolver(db).resolve(
      '00000000-0000-4000-8000-0000000000ff' as never,
    );

    expect(result.ok && result.val).toBeUndefined();
  });

  it('returns an expired session as a row because the use case judges expiry', async () => {
    const { db } = setup({ user: true, actor: true, expires: 1000 });

    const result = await createD1SessionWithUserAndActorResolver(db).resolve(sessionId as never);

    expect(result.ok && result.val?.session.expires).toBe(1000);
    expect(result.ok && result.val?.user).toBeDefined();
    expect(result.ok && result.val?.actor).toBeDefined();
  });

  it('returns the session without a user when the user row is missing', async () => {
    const { db } = setup({ user: false, actor: false, expires: 4_000_000_000_000 });

    const result = await createD1SessionWithUserAndActorResolver(db).resolve(sessionId as never);

    expect(result.ok && result.val?.session.sessionId).toBe(sessionId);
    expect(result.ok && result.val?.user).toBeUndefined();
    expect(result.ok && result.val?.actor).toBeUndefined();
  });

  it('returns the session and user without an actor when the local_actors row is missing', async () => {
    const { db } = setup({ user: true, actor: false, expires: 4_000_000_000_000 });

    const result = await createD1SessionWithUserAndActorResolver(db).resolve(sessionId as never);

    expect(result.ok && result.val?.user?.username).toBe('kosui');
    expect(result.ok && result.val?.actor).toBeUndefined();
  });
});
