import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type { LikeNotification, LikeNotificationsResolverByPostId } from '../../../domain/notification/notification.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { notificationLikesTable, notificationsTable } from '../schema.ts';

const resolve = async ({ postId }: { postId: PostId }): RA<LikeNotification[], never> => {
  const result = await DB.getInstance()
    .select({
      notifications: notificationsTable,
      notificationLikes: notificationLikesTable,
    })
    .from(notificationLikesTable)
    .innerJoin(notificationsTable, eq(notificationLikesTable.notificationId, notificationsTable.notificationId))
    .where(eq(notificationLikesTable.likedPostId, postId));

  return RA.ok(
    result.map((row) => ({
      type: 'like' as const,
      notificationId: NotificationId.orThrow(row.notifications.notificationId),
      recipientUserId: row.notifications.recipientUserId as UserId,
      isRead: row.notifications.isRead === 1,
      likerActorId: ActorId.orThrow(row.notificationLikes.likerActorId),
      likedPostId: PostId.orThrow(row.notificationLikes.likedPostId),
    })),
  );
};

const getInstance = singleton(
  (): LikeNotificationsResolverByPostId => ({
    resolve,
  }),
);

export const PgLikeNotificationsResolverByPostId = {
  getInstance,
} as const;
