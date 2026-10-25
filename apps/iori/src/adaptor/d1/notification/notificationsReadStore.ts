import { RA } from '@iwasa-kosui/result';
import { inArray } from 'drizzle-orm';

import type { NotificationsReadStore } from '../../../domain/notification/notification.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, notificationsTable } from '../schema.ts';

export const createD1NotificationsReadStore = (db: IoriD1Db): NotificationsReadStore => ({
  store: async (event) => {
    const notificationIds = [...event.eventPayload.notificationIds];
    if (notificationIds.length === 0) return RA.ok(undefined);
    await db.batch([
      db.update(notificationsTable).set({ isRead: 1 })
        .where(inArray(notificationsTable.notificationId, notificationIds)),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});
