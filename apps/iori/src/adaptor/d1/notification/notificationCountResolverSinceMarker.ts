import { RA } from '@iwasa-kosui/result';
import { and, count, eq, gt, inArray, or, sql } from 'drizzle-orm';

import type { NotificationCountResolverSinceMarker } from '../../../domain/notification/notification.ts';
import type { IoriD1Db } from '../client.ts';
import { mastodonMarkersTable, notificationsTable } from '../schema.ts';
import { notFromModeratedBlueskyActor } from './moderatedBlueskyNotifications.ts';
import { notFromBlockedActor } from './notFromBlockedActor.ts';

export const createD1NotificationCountResolverSinceMarker = (db: IoriD1Db): NotificationCountResolverSinceMarker => ({
  resolve: async ({ userId, types, limit }) => {
    if (types.length === 0) return RA.ok(0);
    // マーカーの ID が自分の通知として存在しないときは、既読位置を決められないので全件を数える
    const [cursor] = await db.select({
      createdAt: notificationsTable.createdAt,
      notificationId: notificationsTable.notificationId,
    })
      .from(mastodonMarkersTable)
      .innerJoin(
        notificationsTable,
        and(
          eq(notificationsTable.notificationId, mastodonMarkersTable.lastReadId),
          eq(notificationsTable.recipientUserId, userId),
        ),
      )
      .where(and(eq(mastodonMarkersTable.userId, userId), eq(mastodonMarkersTable.timeline, 'notifications')));
    const capped = db.select({ one: sql<number>`1`.as('one') }).from(notificationsTable)
      .where(and(
        eq(notificationsTable.recipientUserId, userId),
        inArray(notificationsTable.type, [...types]),
        notFromModeratedBlueskyActor(db),
        notFromBlockedActor,
        cursor === undefined ? undefined : or(
          gt(notificationsTable.createdAt, cursor.createdAt),
          and(
            eq(notificationsTable.createdAt, cursor.createdAt),
            gt(notificationsTable.notificationId, cursor.notificationId),
          ),
        ),
      ))
      .limit(limit)
      .as('capped');
    const [row] = await db.select({ count: count() }).from(capped);
    return RA.ok(Number(row?.count ?? 0));
  },
});
