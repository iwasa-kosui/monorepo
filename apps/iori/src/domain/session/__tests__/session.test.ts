import { describe, expect, it } from 'vitest';

import { Instant } from '../../instant/instant.ts';
import { UserId } from '../../user/userId.ts';
import { Session } from '../session.ts';

describe('Session.startSession', () => {
  it('uses the same sessionId for the event aggregateId and the session state', () => {
    const now = Instant.now();
    const expires = Instant.addDuration(now, 60 * 1000);

    const event = Session.startSession(now)({ userId: UserId.generate(), expires });

    expect(event.aggregateId).toBe(event.aggregateState.sessionId);
  });
});
