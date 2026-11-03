import type { Instant } from '../../domain/instant/instant.ts';
import type { Notification as DomainNotification } from '../../domain/notification/notification.ts';
import type { Account, Notification, NotificationType, Status } from './entities.ts';
import { toIsoString } from './time.ts';

export type ToNotificationOptions = Readonly<{
  createdAt: Instant;
  account: Account;
  status: Status | null;
}>;

const toType = (notification: DomainNotification): NotificationType | undefined => {
  switch (notification.type) {
    case 'like':
      return 'favourite';
    case 'reply':
      return 'mention';
    case 'follow':
      return 'follow';
    case 'emojiReact':
      return undefined;
  }
};

export const toNotification = (
  notification: DomainNotification,
  options: ToNotificationOptions,
): Notification | undefined => {
  const type = toType(notification);
  if (type === undefined) return undefined;
  return {
    id: notification.notificationId,
    type,
    created_at: toIsoString(options.createdAt),
    account: options.account,
    ...(options.status === null ? {} : { status: options.status }),
  };
};
