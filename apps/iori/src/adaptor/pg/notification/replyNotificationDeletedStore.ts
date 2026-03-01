import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type {
  ReplyNotificationDeleted,
  ReplyNotificationDeletedStore,
} from '../../../domain/notification/notification.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, notificationRepliesTable, notificationsTable } from '../schema.ts';

const store = async (...events: readonly ReplyNotificationDeleted[]): RA<void, never> => {
  if (events.length === 0) {
    return RA.ok(undefined);
  }
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      await tx
        .delete(notificationRepliesTable)
        .where(eq(notificationRepliesTable.notificationId, event.eventPayload.notificationId));
      await tx
        .delete(notificationsTable)
        .where(eq(notificationsTable.notificationId, event.eventPayload.notificationId));
    }
    await tx.insert(domainEventsTable).values(
      events.map((event) => ({
        eventId: event.eventId,
        aggregateId: event.aggregateId,
        aggregateName: event.aggregateName,
        aggregateState: event.aggregateState,
        eventName: event.eventName,
        eventPayload: event.eventPayload,
        occurredAt: new Date(event.occurredAt),
      })),
    );
  });
  return RA.ok(undefined);
};

const getInstance = singleton(
  (): ReplyNotificationDeletedStore => ({
    store,
  }),
);

export const PgReplyNotificationDeletedStore = {
  getInstance,
} as const;
