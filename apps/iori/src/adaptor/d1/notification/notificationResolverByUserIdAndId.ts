import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { NotificationResolverByUserIdAndId } from '../../../domain/notification/notification.ts';
import type { IoriD1Db } from '../client.ts';
import { notificationsTable } from '../schema.ts';
import { notFromBlockedActor } from './notFromBlockedActor.ts';
import { loadNotificationItems } from './notificationItems.ts';

export const createD1NotificationResolverByUserIdAndId = (db: IoriD1Db): NotificationResolverByUserIdAndId => ({
  resolve: async ({ recipientUserId, notificationId }) => {
    const rows = await db.select().from(notificationsTable)
      .where(and(
        eq(notificationsTable.recipientUserId, recipientUserId),
        eq(notificationsTable.notificationId, notificationId),
        notFromBlockedActor,
      ))
      .limit(1);
    const [item] = await loadNotificationItems(db, rows);
    return RA.ok(item);
  },
});
