import { RA } from '@iwasa-kosui/result';
import { and, count, eq } from 'drizzle-orm';

import type { UnreadNotificationCountResolverByUserId } from '../../../domain/notification/notification.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { notificationsTable } from '../schema.ts';

const getInstance = singleton((): UnreadNotificationCountResolverByUserId => {
  const resolve = async (userId: UserId): RA<number, never> => {
    const db = DB.getInstance();

    const result = await db
      .select({ count: count() })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.recipientUserId, userId),
          eq(notificationsTable.isRead, 0),
        ),
      )
      .execute();

    const unreadCount = result[0]?.count ?? 0;
    return RA.ok(unreadCount);
  };

  return { resolve };
});

export const PgUnreadNotificationCountResolverByUserId = {
  getInstance,
} as const;
