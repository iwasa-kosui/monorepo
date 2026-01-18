import { RA } from '@iwasa-kosui/result';

import type {
  EmojiReactNotificationCreated,
  EmojiReactNotificationCreatedStore,
} from '../../../domain/notification/notification.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, notificationEmojiReactsTable, notificationsTable } from '../schema.ts';

const store = async (event: EmojiReactNotificationCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(notificationsTable).values({
      notificationId: event.aggregateState.notificationId,
      recipientUserId: event.aggregateState.recipientUserId,
      type: event.aggregateState.type,
      isRead: event.aggregateState.isRead ? 1 : 0,
      createdAt: new Date(event.occurredAt),
    });
    await tx.insert(notificationEmojiReactsTable).values({
      notificationId: event.aggregateState.notificationId,
      reactorActorId: event.aggregateState.reactorActorId,
      reactedPostId: event.aggregateState.reactedPostId,
      emoji: event.aggregateState.emoji,
    });
    await tx.insert(domainEventsTable).values({
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      aggregateName: event.aggregateName,
      aggregateState: event.aggregateState,
      eventName: event.eventName,
      eventPayload: event.eventPayload,
      occurredAt: new Date(event.occurredAt),
    });
  });
  return RA.ok(undefined);
};

const getInstance = singleton(
  (): EmojiReactNotificationCreatedStore => ({
    store,
  }),
);

export const PgEmojiReactNotificationCreatedStore = {
  getInstance,
} as const;
