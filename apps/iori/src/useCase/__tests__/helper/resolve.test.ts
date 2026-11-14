import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../../domain/actor/localActor.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type { Session, SessionWithUserAndActor } from '../../../domain/session/session.ts';
import type { SessionId } from '../../../domain/session/sessionId.ts';
import type { User } from '../../../domain/user/user.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { Username } from '../../../domain/user/username.ts';
import {
  composeSessionWithUserAndActorResolver,
  resolveSessionWithUserAndActorWith,
  resolveSessionWithUserWith,
} from '../../helper/resolve.ts';

const now = 1_000_000 as Instant;
const userId = crypto.randomUUID() as UserId;
const sessionId = crypto.randomUUID() as SessionId;
const session: Session = { sessionId, userId, expires: (now + 1000) as Instant };
const user: User = { id: userId, username: 'kosui' as Username };
const actor: LocalActor = {
  id: crypto.randomUUID() as LocalActor['id'],
  userId,
  uri: 'https://blog.test/users/kosui',
  inboxUrl: 'https://blog.test/users/kosui/inbox',
  type: 'local',
};

const resolverOf = (found: SessionWithUserAndActor | undefined) => ({ resolve: vi.fn(async () => RA.ok(found)) });

describe('resolveSessionWithUserAndActorWith', () => {
  const run = (found: SessionWithUserAndActor | undefined) =>
    resolveSessionWithUserAndActorWith(resolverOf(found), now)(sessionId);

  it('returns SessionExpiredError when the session row is missing', async () => {
    const result = await run(undefined);
    expect(!result.ok && result.err.type).toBe('SessionExpiredError');
  });

  it('returns SessionExpiredError when the session has expired', async () => {
    const result = await run({ session: { ...session, expires: now as Instant }, user, actor });
    expect(!result.ok && result.err.type).toBe('SessionExpiredError');
  });

  it('returns SessionExpiredError for an expired session even without a user', async () => {
    const result = await run({ session: { ...session, expires: now as Instant }, user: undefined, actor: undefined });
    expect(!result.ok && result.err.type).toBe('SessionExpiredError');
  });

  it('returns UserNotFoundError when the user is missing', async () => {
    const result = await run({ session, user: undefined, actor });
    expect(!result.ok && result.err).toMatchObject({ type: 'UserNotFoundError', detail: { userId } });
  });

  it('returns UserNotFoundError when the actor is missing', async () => {
    const result = await run({ session, user, actor: undefined });
    expect(!result.ok && result.err).toMatchObject({ type: 'UserNotFoundError', detail: { userId } });
  });

  it('returns the session, user, and actor', async () => {
    const result = await run({ session, user, actor });
    expect(result.ok && result.val).toEqual({ session, user, actor });
  });
});

describe('resolveSessionWithUserWith', () => {
  const run = (found: SessionWithUserAndActor | undefined) =>
    resolveSessionWithUserWith(resolverOf(found), now)(sessionId);

  it('returns SessionExpiredError when the session has expired', async () => {
    const result = await run({ session: { ...session, expires: now as Instant }, user, actor });
    expect(!result.ok && result.err.type).toBe('SessionExpiredError');
  });

  it('does not require an actor', async () => {
    const result = await run({ session, user, actor: undefined });
    expect(result.ok && result.val).toEqual({ session, user });
  });
});

describe('composeSessionWithUserAndActorResolver', () => {
  it('skips the actor lookup when the user is missing', async () => {
    const actorResolver = { resolve: vi.fn(async () => RA.ok(actor)) };
    const resolver = composeSessionWithUserAndActorResolver(
      { resolve: async () => RA.ok(session) },
      { resolve: async () => RA.ok(undefined) },
      actorResolver,
    );

    const result = await resolver.resolve(sessionId);

    expect(result.ok && result.val).toEqual({ session, user: undefined, actor: undefined });
    expect(actorResolver.resolve).not.toHaveBeenCalled();
  });
});
