import { RA } from '@iwasa-kosui/result';
import { inArray } from 'drizzle-orm';

import type { NotificationsRead, NotificationsReadStore } from '../../../domain/notification/notification.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, notificationsTable } from '../schema.ts';

const store = async (event: NotificationsRead): RA<void, never> => {
  const { notificationIds } = event.eventPayload;

  if (notificationIds.length === 0) {
    return RA.ok(undefined);
  }

  await DB.getInstance().transaction(async (tx) => {
    await tx
      .update(notificationsTable)
      .set({ isRead: 1 })
      .where(inArray(notificationsTable.notificationId, [...notificationIds]));

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
  (): NotificationsReadStore => ({
    store,
  }),
);

export const PgNotificationsReadStore = {
  getInstance,
} as const;
