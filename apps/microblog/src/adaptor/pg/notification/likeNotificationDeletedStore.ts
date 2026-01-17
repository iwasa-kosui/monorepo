import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type {
  LikeNotificationDeleted,
  LikeNotificationDeletedStore,
} from '../../../domain/notification/notification.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, notificationLikesTable, notificationsTable } from '../schema.ts';

const store = async (event: LikeNotificationDeleted): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx
      .delete(notificationLikesTable)
      .where(eq(notificationLikesTable.notificationId, event.eventPayload.notificationId));
    await tx
      .delete(notificationsTable)
      .where(eq(notificationsTable.notificationId, event.eventPayload.notificationId));
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
  (): LikeNotificationDeletedStore => ({
    store,
  }),
);

export const PgLikeNotificationDeletedStore = {
  getInstance,
} as const;
