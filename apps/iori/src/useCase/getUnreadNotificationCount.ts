import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import type { UnreadNotificationCountResolverByUserId } from '../domain/notification/notification.ts';
import type {
  SessionExpiredError,
  SessionResolver,
  SessionWithUserAndActorResolver,
} from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { composeSessionWithUserAndActorResolver, resolveSessionWithUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ sessionId: SessionId }>;
type Err = SessionExpiredError | UserNotFoundError;

export type GetUnreadNotificationCountUseCase = UseCase<Input, number, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  sessionWithUserAndActorResolver?: SessionWithUserAndActorResolver;
  unreadNotificationCountResolverByUserId: UnreadNotificationCountResolverByUserId;
}>;

export const createGetUnreadNotificationCountUseCase = ({
  sessionResolver,
  userResolver,
  sessionWithUserAndActorResolver,
  unreadNotificationCountResolverByUserId,
}: Deps): GetUnreadNotificationCountUseCase => {
  const now = Instant.now();
  const resolveSessionUser = resolveSessionWithUserWith(
    sessionWithUserAndActorResolver
      ?? composeSessionWithUserAndActorResolver(sessionResolver, userResolver, undefined),
    now,
  );

  return {
    run: (input) =>
      RA.flow(
        RA.ok(input),
        RA.andThen(({ sessionId }) => resolveSessionUser(sessionId)),
        RA.andThen(({ user }) => unreadNotificationCountResolverByUserId.resolve(user.id)),
      ),
  };
};
