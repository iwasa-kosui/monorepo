import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import {
  type EmojiReactNotification,
  type EmojiReactNotificationsResolverByPostId,
} from '../../../domain/notification/notification.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { notificationEmojiReactsTable, notificationsTable } from '../schema.ts';

const getInstance = singleton((): EmojiReactNotificationsResolverByPostId => {
  const resolve = async ({ postId }: { postId: PostId }): RA<EmojiReactNotification[], never> => {
    const db = DB.getInstance();

    const rows = await db
      .select({
        notifications: notificationsTable,
        notificationEmojiReacts: notificationEmojiReactsTable,
      })
      .from(notificationsTable)
      .innerJoin(
        notificationEmojiReactsTable,
        eq(notificationsTable.notificationId, notificationEmojiReactsTable.notificationId),
      )
      .where(eq(notificationEmojiReactsTable.reactedPostId, postId))
      .execute();

    const notifications: EmojiReactNotification[] = rows.map((row) => ({
      type: 'emojiReact',
      notificationId: NotificationId.orThrow(row.notifications.notificationId),
      recipientUserId: row.notifications.recipientUserId as UserId,
      isRead: row.notifications.isRead === 1,
      reactorActorId: row.notificationEmojiReacts.reactorActorId as ActorId,
      reactedPostId: row.notificationEmojiReacts.reactedPostId as PostId,
      emoji: row.notificationEmojiReacts.emoji,
    }));

    return RA.ok(notifications);
  };

  return { resolve };
});

export const PgEmojiReactNotificationsResolverByPostId = {
  getInstance,
} as const;
