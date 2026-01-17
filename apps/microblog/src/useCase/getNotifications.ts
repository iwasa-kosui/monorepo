import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import {
  Notification,
  type NotificationsReadStore,
  type NotificationsResolverByUserId,
  type NotificationWithDetails,
} from '../domain/notification/notification.ts';
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
  notificationsReadStore: NotificationsReadStore;
}>;

const create = ({
  sessionResolver,
  userResolver,
  notificationsResolver,
  notificationsReadStore,
}: Deps): GetNotificationsUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);

  const markUnreadAsRead = (
    notifications: ReadonlyArray<NotificationWithDetails>,
    userId: User['id'],
  ) => {
    const unreadNotificationIds = notifications
      .filter((n) => !n.notification.isRead)
      .map((n) => n.notification.notificationId);

    if (unreadNotificationIds.length === 0) {
      return RA.ok(undefined);
    }

    const event = Notification.markAsRead(unreadNotificationIds, userId, now);
    return notificationsReadStore.store(event);
  };

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      RA.andBind('notifications', ({ user }) => notificationsResolver.resolve(user.id)),
      RA.andThrough(({ notifications, user }) => markUnreadAsRead(notifications, user.id)),
    );

  return { run };
};

export const GetNotificationsUseCase = {
  create,
} as const;
