import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import {
  Notification,
  type NotificationDismissedStore,
  NotificationNotFoundError,
  type NotificationResolverByUserIdAndId,
} from '../domain/notification/notification.ts';
import type { NotificationId } from '../domain/notification/notificationId.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  userId: UserId;
  notificationId: NotificationId;
}>;

export type DismissNotificationUseCase = UseCase<Input, void, NotificationNotFoundError>;

type Deps = Readonly<{
  notificationResolverByUserIdAndId: NotificationResolverByUserIdAndId;
  notificationDismissedStore: NotificationDismissedStore;
}>;

const create = (
  { notificationResolverByUserIdAndId, notificationDismissedStore }: Deps,
): DismissNotificationUseCase => {
  const run = async ({ userId, notificationId }: Input) =>
    RA.flow(
      notificationResolverByUserIdAndId.resolve({ recipientUserId: userId, notificationId }),
      RA.andThen((item) =>
        item === undefined
          ? RA.err(NotificationNotFoundError.create(notificationId))
          : RA.ok(Notification.dismissNotification(item.notification, Instant.now()))
      ),
      RA.andThrough((event) => notificationDismissedStore.store(event)),
      RA.map(() => undefined),
    );

  return { run };
};

export const DismissNotificationUseCase = { create } as const;
