import { RA } from '@iwasa-kosui/result';

import type {
  LikeNotificationCreated,
  LikeNotificationCreatedStore,
} from '../../../domain/notification/notification.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, notificationLikesTable, notificationsTable } from '../schema.ts';

const store = async (event: LikeNotificationCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(notificationsTable).values({
      notificationId: event.aggregateState.notificationId,
      recipientUserId: event.aggregateState.recipientUserId,
      type: event.aggregateState.type,
      isRead: event.aggregateState.isRead ? 1 : 0,
      createdAt: new Date(event.occurredAt),
    });
    await tx.insert(notificationLikesTable).values({
      notificationId: event.aggregateState.notificationId,
      likerActorId: event.aggregateState.likerActorId,
      likedPostId: event.aggregateState.likedPostId,
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
  (): LikeNotificationCreatedStore => ({
    store,
  }),
);

export const PgLikeNotificationCreatedStore = {
  getInstance,
} as const;
