import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import {
  type EmojiReactNotification,
  type EmojiReactNotificationResolverByActorIdAndPostIdAndEmoji,
} from '../../../domain/notification/notification.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { notificationEmojiReactsTable, notificationsTable } from '../schema.ts';

const getInstance = singleton((): EmojiReactNotificationResolverByActorIdAndPostIdAndEmoji => {
  const resolve = async ({
    reactorActorId,
    reactedPostId,
    emoji,
  }: { reactorActorId: ActorId; reactedPostId: PostId; emoji: string }): RA<
    EmojiReactNotification | undefined,
    never
  > => {
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
      .where(
        and(
          eq(notificationEmojiReactsTable.reactorActorId, reactorActorId),
          eq(notificationEmojiReactsTable.reactedPostId, reactedPostId),
          eq(notificationEmojiReactsTable.emoji, emoji),
        ),
      )
      .limit(1)
      .execute();

    if (rows.length === 0) {
      return RA.ok(undefined);
    }

    const row = rows[0];
    const notification: EmojiReactNotification = {
      type: 'emojiReact',
      notificationId: NotificationId.orThrow(row.notifications.notificationId),
      recipientUserId: row.notifications.recipientUserId as UserId,
      isRead: row.notifications.isRead === 1,
      reactorActorId: row.notificationEmojiReacts.reactorActorId as ActorId,
      reactedPostId: row.notificationEmojiReacts.reactedPostId as PostId,
      emoji: row.notificationEmojiReacts.emoji,
      emojiImageUrl: row.notificationEmojiReacts.emojiImageUrl,
    };

    return RA.ok(notification);
  };

  return { resolve };
});

export const PgEmojiReactNotificationResolverByActorIdAndPostIdAndEmoji = {
  getInstance,
} as const;
