import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../../domain/actor/actor.ts';
import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import {
  Session,
  SessionExpiredError,
  type SessionResolver,
  type SessionWithUserAndActorResolver,
} from '../../domain/session/session.ts';
import type { SessionId } from '../../domain/session/sessionId.ts';
import {
  type User,
  UserNotFoundError,
  type UserResolver,
  type UserResolverByUsername,
  type UserWithLocalActorResolverByUsername,
} from '../../domain/user/user.ts';
import type { UserId } from '../../domain/user/userId.ts';
import type { Username } from '../../domain/user/username.ts';

export const resolveSessionWith = (sessionResolver: SessionResolver, now: Instant) =>
(
  sessionId: SessionId,
): RA<Session, SessionExpiredError> =>
  RA.flow(
    sessionResolver.resolve(sessionId),
    RA.andThen((session) => session ? RA.ok(session) : RA.err(SessionExpiredError.create(sessionId))),
    RA.andThen((session) =>
      Session.verify(session, now)
        ? RA.ok(session)
        : RA.err(SessionExpiredError.create(sessionId))
    ),
  );

export const resolveUserWith = (userResolver: UserResolver) => (userId: UserId): RA<User, UserNotFoundError> =>
  RA.flow(
    userResolver.resolve(userId),
    RA.andThen((user) => user ? RA.ok(user) : RA.err(UserNotFoundError.create({ userId }))),
  );

export const resolveUserByUsernameWith =
  (userResolverByUsername: UserResolverByUsername) => (username: Username): RA<User, UserNotFoundError> =>
    RA.flow(
      userResolverByUsername.resolve(username),
      RA.andThen((user) => user ? RA.ok(user) : RA.err(UserNotFoundError.create({ username }))),
    );

export const resolveUserWithLocalActorByUsernameWith =
  (resolver: UserWithLocalActorResolverByUsername) =>
  (username: Username): RA<{ user: User; actor: LocalActor }, UserNotFoundError> =>
    RA.flow(
      resolver.resolve(username),
      RA.andThen((found) => {
        if (!found) return RA.err(UserNotFoundError.create({ username }));
        if (!found.actor) return RA.err(UserNotFoundError.create({ userId: found.user.id }));
        return RA.ok({ user: found.user, actor: found.actor });
      }),
    );

export const resolveLocalActorWith =
  (actorResolverByUserId: ActorResolverByUserId) => (userId: UserId): RA<LocalActor, UserNotFoundError> =>
    RA.flow(
      actorResolverByUserId.resolve(userId),
      RA.andThen((actor) =>
        actor
          ? RA.ok(actor)
          : RA.err(UserNotFoundError.create({ userId }))
      ),
    );

export const resolveSessionWithUserWith = (resolver: SessionWithUserAndActorResolver, now: Instant) =>
(
  sessionId: SessionId,
): RA<{ session: Session; user: User }, SessionExpiredError | UserNotFoundError> =>
  RA.flow(
    resolver.resolve(sessionId),
    RA.andThen((found): RA<{ session: Session; user: User }, SessionExpiredError | UserNotFoundError> => {
      if (!found) return RA.err(SessionExpiredError.create(sessionId));
      if (!Session.verify(found.session, now)) return RA.err(SessionExpiredError.create(sessionId));
      if (!found.user) return RA.err(UserNotFoundError.create({ userId: found.session.userId }));
      return RA.ok({ session: found.session, user: found.user });
    }),
  );

export const resolveSessionWithUserAndActorWith = (resolver: SessionWithUserAndActorResolver, now: Instant) =>
(
  sessionId: SessionId,
): RA<{ session: Session; user: User; actor: LocalActor }, SessionExpiredError | UserNotFoundError> =>
  RA.flow(
    resolver.resolve(sessionId),
    RA.andThen((found): RA<
      { session: Session; user: User; actor: LocalActor },
      SessionExpiredError | UserNotFoundError
    > => {
      if (!found) return RA.err(SessionExpiredError.create(sessionId));
      if (!Session.verify(found.session, now)) return RA.err(SessionExpiredError.create(sessionId));
      if (!found.user) return RA.err(UserNotFoundError.create({ userId: found.session.userId }));
      if (!found.actor) return RA.err(UserNotFoundError.create({ userId: found.user.id }));
      return RA.ok({ session: found.session, user: found.user, actor: found.actor });
    }),
  );

export const composeSessionWithUserAndActorResolver = (
  sessionResolver: SessionResolver,
  userResolver: UserResolver,
  actorResolverByUserId: ActorResolverByUserId | undefined,
): SessionWithUserAndActorResolver => ({
  resolve: async (sessionId) => {
    const session = await sessionResolver.resolve(sessionId);
    if (!session.ok) return session;
    if (session.val === undefined) return RA.ok(undefined);
    const user = await userResolver.resolve(session.val.userId);
    if (!user.ok) return user;
    if (user.val === undefined || actorResolverByUserId === undefined) {
      return RA.ok({ session: session.val, user: user.val, actor: undefined });
    }
    const actor = await actorResolverByUserId.resolve(user.val.id);
    if (!actor.ok) return actor;
    return RA.ok({ session: session.val, user: user.val, actor: actor.val });
  },
});
