import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import {
  type LikeNotification,
  type LikeNotificationResolverByActorIdAndPostId,
} from '../../../domain/notification/notification.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { notificationLikesTable, notificationsTable } from '../schema.ts';

const getInstance = singleton((): LikeNotificationResolverByActorIdAndPostId => {
  const resolve = async ({
    likerActorId,
    likedPostId,
  }: { likerActorId: ActorId; likedPostId: PostId }): RA<LikeNotification | undefined, never> => {
    const db = DB.getInstance();

    const rows = await db
      .select({
        notifications: notificationsTable,
        notificationLikes: notificationLikesTable,
      })
      .from(notificationsTable)
      .innerJoin(
        notificationLikesTable,
        eq(notificationsTable.notificationId, notificationLikesTable.notificationId),
      )
      .where(
        and(
          eq(notificationLikesTable.likerActorId, likerActorId),
          eq(notificationLikesTable.likedPostId, likedPostId),
        ),
      )
      .limit(1)
      .execute();

    if (rows.length === 0) {
      return RA.ok(undefined);
    }

    const row = rows[0];
    const notification: LikeNotification = {
      type: 'like',
      notificationId: NotificationId.orThrow(row.notifications.notificationId),
      recipientUserId: row.notifications.recipientUserId as UserId,
      isRead: row.notifications.isRead === 1,
      likerActorId: row.notificationLikes.likerActorId as ActorId,
      likedPostId: row.notificationLikes.likedPostId as PostId,
    };

    return RA.ok(notification);
  };

  return { resolve };
});

export const PgLikeNotificationResolverByActorIdAndPostId = {
  getInstance,
} as const;
