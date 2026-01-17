import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import type { NotificationsResolverByUserId, NotificationWithDetails } from '../domain/notification/notification.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { User, UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
}>;

type Ok = Readonly<{
  user: User;
  notifications: ReadonlyArray<NotificationWithDetails>;
}>;

type Err = SessionExpiredError | UserNotFoundError;

export type GetNotificationsUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  notificationsResolver: NotificationsResolverByUserId;
}>;

const create = ({
  sessionResolver,
  userResolver,
  notificationsResolver,
}: Deps): GetNotificationsUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      RA.andBind('notifications', ({ user }) => notificationsResolver.resolve(user.id)),
    );

  return { run };
};

export const GetNotificationsUseCase = {
  create,
} as const;
