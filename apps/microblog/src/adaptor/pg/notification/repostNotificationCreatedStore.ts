import { RA } from '@iwasa-kosui/result';

import type {
  RepostNotificationCreated,
  RepostNotificationCreatedStore,
} from '../../../domain/notification/notification.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, notificationRepostsTable, notificationsTable } from '../schema.ts';

const store = async (event: RepostNotificationCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(notificationsTable).values({
      notificationId: event.aggregateState.notificationId,
      recipientUserId: event.aggregateState.recipientUserId,
      type: event.aggregateState.type,
      isRead: event.aggregateState.isRead ? 1 : 0,
      createdAt: new Date(event.occurredAt),
    });
    await tx.insert(notificationRepostsTable).values({
      notificationId: event.aggregateState.notificationId,
      reposterActorId: event.aggregateState.reposterActorId,
      repostedPostId: event.aggregateState.repostedPostId,
      repostId: event.aggregateState.repostId,
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
  (): RepostNotificationCreatedStore => ({
    store,
  }),
);

export const PgRepostNotificationCreatedStore = {
  getInstance,
} as const;
