import { describe, expect, it } from 'vitest';

import { Instant } from '../../instant/instant.ts';
import { UserId } from '../../user/userId.ts';
import { Session } from '../session.ts';
import { SessionId } from '../sessionId.ts';

describe('Session.startSession', () => {
  it('uses the same sessionId for the event aggregateId and the session state', () => {
    const now = Instant.now();
    const expires = Instant.addDuration(now, 60 * 1000);

    const event = Session.startSession(now)({ userId: UserId.generate(), expires });

    expect(event.aggregateId).toBe(event.aggregateState.sessionId);
  });
});

describe('Session.endSession', () => {
  it('sessionId を aggregateId にし、状態を持たない session.ended を作る', () => {
    const now = Instant.now();
    const session = {
      sessionId: SessionId.generate(),
      userId: UserId.generate(),
      expires: Instant.addDuration(now, 1000),
    };

    const event = Session.endSession(now)(session);

    expect(event.eventName).toBe('session.ended');
    expect(event.aggregateId).toBe(session.sessionId);
    expect(event.aggregateState).toBeUndefined();
    expect(event.eventPayload).toEqual({ sessionId: session.sessionId, userId: session.userId });
  });
});
