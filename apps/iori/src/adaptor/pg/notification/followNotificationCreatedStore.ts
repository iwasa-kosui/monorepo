import { RA } from '@iwasa-kosui/result';

import type {
  FollowNotificationCreated,
  FollowNotificationCreatedStore,
} from '../../../domain/notification/notification.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, notificationFollowsTable, notificationsTable } from '../schema.ts';

const store = async (event: FollowNotificationCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(notificationsTable).values({
      notificationId: event.aggregateState.notificationId,
      recipientUserId: event.aggregateState.recipientUserId,
      type: event.aggregateState.type,
      isRead: event.aggregateState.isRead ? 1 : 0,
      createdAt: new Date(event.occurredAt),
    });
    await tx.insert(notificationFollowsTable).values({
      notificationId: event.aggregateState.notificationId,
      followerActorId: event.aggregateState.followerActorId,
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
  (): FollowNotificationCreatedStore => ({
    store,
  }),
);

export const PgFollowNotificationCreatedStore = {
  getInstance,
} as const;
