import { RA } from '@iwasa-kosui/result';

import { Instant } from '../domain/instant/instant.ts';
import {
  Notification,
  type NotificationsClearedStore,
  type NotificationsResolverByPage,
} from '../domain/notification/notification.ts';
import type { UserId } from '../domain/user/userId.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{ userId: UserId }>;

export type ClearNotificationsUseCase = UseCase<Input, void, never>;

type Deps = Readonly<{
  notificationsResolverByPage: NotificationsResolverByPage;
  notificationsClearedStore: NotificationsClearedStore;
}>;

const allTypes: ReadonlyArray<Notification['type']> = [
  'like',
  'follow',
  'emojiReact',
  'reply',
  'mention',
  'blueskyLike',
  'blueskyRepost',
  'blueskyFollow',
  'blueskyMention',
];

const create = ({ notificationsResolverByPage, notificationsClearedStore }: Deps): ClearNotificationsUseCase => {
  const run = async ({ userId }: Input) =>
    RA.flow(
      notificationsResolverByPage.resolve({
        recipientUserId: userId,
        page: { limit: 1, olderThanId: undefined, newerThanId: undefined, order: 'newestFirst' },
        types: allTypes,
      }),
      RA.andThrough((existing) =>
        existing.length === 0
          ? RA.ok(undefined)
          : notificationsClearedStore.store(Notification.clearNotifications(userId, Instant.now()))
      ),
      RA.map(() => undefined),
    );

  return { run };
};

export const ClearNotificationsUseCase = { create } as const;
