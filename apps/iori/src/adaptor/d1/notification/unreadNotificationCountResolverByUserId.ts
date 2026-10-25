import { RA } from '@iwasa-kosui/result';
import { and, count, eq } from 'drizzle-orm';

import type { UnreadNotificationCountResolverByUserId } from '../../../domain/notification/notification.ts';
import type { IoriD1Db } from '../client.ts';
import { notificationsTable } from '../schema.ts';

export const createD1UnreadNotificationCountResolverByUserId = (
  db: IoriD1Db,
): UnreadNotificationCountResolverByUserId => ({
  resolve: async (userId) => {
    const [row] = await db.select({ count: count() }).from(notificationsTable)
      .where(and(
        eq(notificationsTable.recipientUserId, userId),
        eq(notificationsTable.isRead, 0),
      ));
    return RA.ok(Number(row?.count ?? 0));
  },
});
