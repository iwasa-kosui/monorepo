import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { createD1Db } from '../src/adaptor/d1/client.ts';
import { createD1SessionEndedStore } from '../src/adaptor/d1/session/sessionEndedStore.ts';
import { createD1SessionResolver } from '../src/adaptor/d1/session/sessionResolver.ts';
import { createD1SessionStartedStore } from '../src/adaptor/d1/session/sessionStartedStore.ts';
import { Instant } from '../src/domain/instant/instant.ts';
import { Session } from '../src/domain/session/session.ts';
import { SessionId } from '../src/domain/session/sessionId.ts';
import { UserId } from '../src/domain/user/userId.ts';
import { SignOutUseCase } from '../src/useCase/signOut.ts';

describe('サインアウトの D1 ストア', () => {
  const db = createD1Db(env.DB);
  const sessionResolver = createD1SessionResolver(db);
  const signOut = SignOutUseCase.create({ sessionResolver, sessionEndedStore: createD1SessionEndedStore(db) });

  const startSession = async () => {
    const userId = UserId.generate();
    await env.DB.prepare('INSERT INTO users(userId, username) VALUES (?, ?)').bind(userId, `user-${userId}`).run();
    const now = Instant.now();
    const started = Session.startSession(now)({ userId, expires: Instant.addDuration(now, 60 * 1000) });
    await createD1SessionStartedStore(db).store(started);
    return started.aggregateState;
  };

  const sessionRowCount = async (sessionId: string) =>
    (await env.DB.prepare('SELECT COUNT(*) AS count FROM sessions WHERE sessionId = ?')
      .bind(sessionId).first<{ count: number }>())!.count;

  const endedEvents = async (sessionId: string) =>
    (await env.DB.prepare(
      'SELECT aggregateId, aggregateState, eventPayload FROM domain_events WHERE eventName = ? AND aggregateId = ?',
    )
      .bind('session.ended', JSON.stringify(sessionId)).all<{
      aggregateId: string;
      aggregateState: string | null;
      eventPayload: string;
    }>()).results;

  it('sessions の行を消し、session.ended をイベント表に入れる', async () => {
    const session = await startSession();
    expect(await sessionRowCount(session.sessionId)).toBe(1);

    const result = await signOut.run({ sessionId: session.sessionId });

    expect(result.ok).toBe(true);
    expect(await sessionRowCount(session.sessionId)).toBe(0);
    const resolved = await sessionResolver.resolve(session.sessionId);
    expect(resolved.ok && resolved.val).toBeUndefined();
    const events = await endedEvents(session.sessionId);
    expect(events).toHaveLength(1);
    expect(events[0]!.aggregateState).toBeNull();
    expect(JSON.parse(events[0]!.eventPayload)).toEqual({ sessionId: session.sessionId, userId: session.userId });
  });

  it('他のセッションの行は消さない', async () => {
    const target = await startSession();
    const other = await startSession();

    await signOut.run({ sessionId: target.sessionId });

    expect(await sessionRowCount(other.sessionId)).toBe(1);
  });

  it('存在しないセッションは何もせず成功にする', async () => {
    const sessionId = SessionId.generate();

    const result = await signOut.run({ sessionId });

    expect(result.ok).toBe(true);
    expect(await endedEvents(sessionId)).toHaveLength(0);
  });

  it('2 回続けても 2 回目は成功し、イベントを重ねない', async () => {
    const session = await startSession();

    await signOut.run({ sessionId: session.sessionId });
    const second = await signOut.run({ sessionId: session.sessionId });

    expect(second.ok).toBe(true);
    expect(await endedEvents(session.sessionId)).toHaveLength(1);
  });
});
