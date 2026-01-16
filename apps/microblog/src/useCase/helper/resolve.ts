import { RA } from "@iwasa-kosui/result";

import type { ActorResolverByUserId } from "../../domain/actor/actor.ts";
import type { LocalActor } from "../../domain/actor/localActor.ts";
import type { Instant } from "../../domain/instant/instant.ts";
import { Session, SessionExpiredError, type SessionResolver } from "../../domain/session/session.ts";
import type { SessionId } from "../../domain/session/sessionId.ts";
import { type User, UserNotFoundError, type UserResolver, type UserResolverByUsername } from "../../domain/user/user.ts";
import type { UserId } from "../../domain/user/userId.ts";
import type { Username } from "../../domain/user/username.ts";

export const resolveSessionWith = (sessionResolver: SessionResolver, now: Instant) => (
  sessionId: SessionId
): RA<Session, SessionExpiredError> =>
  RA.flow(
    sessionResolver.resolve(sessionId),
    RA.andThen((session) =>
      session ? RA.ok(session) : RA.err(SessionExpiredError.create(sessionId))
    ),
    RA.andThen((session) =>
      Session.verify(session, now)
        ? RA.ok(session)
        : RA.err(SessionExpiredError.create(sessionId))
    )
  );

export const resolveUserWith = (userResolver: UserResolver) => (userId: UserId): RA<User, UserNotFoundError> =>
  RA.flow(
    userResolver.resolve(userId),
    RA.andThen((user) =>
      user ? RA.ok(user) : RA.err(UserNotFoundError.create({ userId }))
    )
  );

export const resolveUserByUsernameWith = (userResolverByUsername: UserResolverByUsername) => (username: Username): RA<User, UserNotFoundError> =>
  RA.flow(
    userResolverByUsername.resolve(username),
    RA.andThen((user) =>
      user ? RA.ok(user) : RA.err(UserNotFoundError.create({ username }))
    )
  );

export const resolveLocalActorWith = (actorResolverByUserId: ActorResolverByUserId) => (userId: UserId): RA<LocalActor, UserNotFoundError> =>
  RA.flow(
    actorResolverByUserId.resolve(userId),
    RA.andThen((actor) =>
      actor
        ? RA.ok(actor)
        : RA.err(UserNotFoundError.create({ userId }))
    )
  );
