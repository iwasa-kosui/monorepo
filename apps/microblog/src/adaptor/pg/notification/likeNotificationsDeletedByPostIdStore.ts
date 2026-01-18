import { RA } from '@iwasa-kosui/result';
import { eq, inArray } from 'drizzle-orm';

import type {
  LikeNotificationsDeletedByPostId,
  LikeNotificationsDeletedByPostIdStore,
} from '../../../domain/notification/notification.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, notificationLikesTable, notificationsTable } from '../schema.ts';

const store = async (event: LikeNotificationsDeletedByPostId): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    const notificationIds = await tx
      .select({ notificationId: notificationLikesTable.notificationId })
      .from(notificationLikesTable)
      .where(eq(notificationLikesTable.likedPostId, event.eventPayload.postId));

    if (notificationIds.length > 0) {
      const ids = notificationIds.map((n) => n.notificationId);
      await tx.delete(notificationLikesTable).where(inArray(notificationLikesTable.notificationId, ids));
      await tx.delete(notificationsTable).where(inArray(notificationsTable.notificationId, ids));
    }

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
  (): LikeNotificationsDeletedByPostIdStore => ({
    store,
  }),
);

export const PgLikeNotificationsDeletedByPostIdStore = {
  getInstance,
} as const;
