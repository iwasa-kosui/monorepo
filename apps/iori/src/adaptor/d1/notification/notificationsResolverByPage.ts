import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { NotificationsResolverByPage } from '../../../domain/notification/notification.ts';
import type { IoriD1Db } from '../client.ts';
import { pageConditions, pageOrderBy } from '../pageCondition.ts';
import { notificationsTable } from '../schema.ts';
import { notFromModeratedBlueskyActor } from './moderatedBlueskyNotifications.ts';
import { notFromBlockedActor } from './notFromBlockedActor.ts';
import { loadNotificationItems } from './notificationItems.ts';

const cursorNotification = alias(notificationsTable, 'cursor_notification');

const cursorOf = (id: string) =>
  sql`select ${cursorNotification.createdAt}, ${cursorNotification.notificationId}
    from ${notificationsTable} ${cursorNotification}
    where ${cursorNotification.notificationId} = ${id} limit 1`;

export const createD1NotificationsResolverByPage = (db: IoriD1Db): NotificationsResolverByPage => ({
  resolve: async ({ recipientUserId, page, types }) => {
    if (types.length === 0) return RA.ok([]);
    const columns = { createdAt: notificationsTable.createdAt, id: notificationsTable.notificationId };
    const rows = await db.select().from(notificationsTable)
      .where(and(
        eq(notificationsTable.recipientUserId, recipientUserId),
        inArray(notificationsTable.type, [...types]),
        notFromModeratedBlueskyActor(db),
        notFromBlockedActor,
        ...pageConditions(page, columns, cursorOf),
      ))
      .orderBy(...pageOrderBy(page, columns))
      .limit(page.limit);
    return RA.ok(await loadNotificationItems(db, rows));
  },
});
