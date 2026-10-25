import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import type { UnreadNotificationCountResolverByUserId } from '../domain/notification/notification.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ sessionId: SessionId }>;
type Err = SessionExpiredError | UserNotFoundError;

export type GetUnreadNotificationCountUseCase = UseCase<Input, number, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  unreadNotificationCountResolverByUserId: UnreadNotificationCountResolverByUserId;
}>;

export const createGetUnreadNotificationCountUseCase = ({
  sessionResolver,
  userResolver,
  unreadNotificationCountResolverByUserId,
}: Deps): GetUnreadNotificationCountUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);

  return {
    run: (input) =>
      RA.flow(
        RA.ok(input),
        RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
        RA.andBind('user', ({ session }) => resolveUser(session.userId)),
        RA.andThen(({ user }) => unreadNotificationCountResolverByUserId.resolve(user.id)),
      ),
  };
};
