import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { NotificationIdsResolverByUserIdAndCreatedAt } from '../../../domain/notification/notification.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import type { IoriD1Db } from '../client.ts';
import { notificationsTable } from '../schema.ts';

export const createD1NotificationIdsResolverByUserIdAndCreatedAt = (
  db: IoriD1Db,
): NotificationIdsResolverByUserIdAndCreatedAt => ({
  resolve: async ({ recipientUserId, createdAt }) => {
    const rows = await db.select({ notificationId: notificationsTable.notificationId }).from(notificationsTable)
      .where(and(
        eq(notificationsTable.recipientUserId, recipientUserId),
        eq(notificationsTable.createdAt, new Date(createdAt)),
      ));
    return RA.ok(rows.map((row) => NotificationId.orThrow(row.notificationId)));
  },
});
