import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import type {
  ReplyNotification,
  ReplyNotificationsResolverByReplyPostId,
} from '../../../domain/notification/notification.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { notificationRepliesTable, notificationsTable } from '../schema.ts';

const resolve = async ({ replyPostId }: { replyPostId: PostId }): RA<ReplyNotification[], never> => {
  const result = await DB.getInstance()
    .select({
      notifications: notificationsTable,
      notificationReplies: notificationRepliesTable,
    })
    .from(notificationRepliesTable)
    .innerJoin(notificationsTable, eq(notificationRepliesTable.notificationId, notificationsTable.notificationId))
    .where(eq(notificationRepliesTable.replyPostId, replyPostId));

  return RA.ok(
    result.map((row) => ({
      type: 'reply' as const,
      notificationId: NotificationId.orThrow(row.notifications.notificationId),
      recipientUserId: row.notifications.recipientUserId as UserId,
      isRead: row.notifications.isRead === 1,
      replierActorId: ActorId.orThrow(row.notificationReplies.replierActorId),
      replyPostId: PostId.orThrow(row.notificationReplies.replyPostId),
      originalPostId: PostId.orThrow(row.notificationReplies.originalPostId),
    })),
  );
};

const getInstance = singleton(
  (): ReplyNotificationsResolverByReplyPostId => ({
    resolve,
  }),
);

export const PgReplyNotificationsResolverByReplyPostId = {
  getInstance,
} as const;
