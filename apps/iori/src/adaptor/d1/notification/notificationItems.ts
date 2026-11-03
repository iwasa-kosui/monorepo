import { inArray } from 'drizzle-orm';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { Notification, NotificationItem } from '../../../domain/notification/notification.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import {
  notificationEmojiReactsTable,
  notificationFollowsTable,
  notificationLikesTable,
  notificationRepliesTable,
  type notificationsTable,
} from '../schema.ts';

type NotificationRow = typeof notificationsTable.$inferSelect;

const rowsByNotificationId = async <T extends { notificationId: string }>(
  ids: ReadonlyArray<string>,
  select: (ids: string[]) => PromiseLike<T[]>,
): Promise<ReadonlyMap<string, T>> =>
  new Map((ids.length === 0 ? [] : await select([...ids])).map((row) => [row.notificationId, row]));

export const loadNotificationItems = async (
  db: IoriD1Db,
  rows: ReadonlyArray<NotificationRow>,
): Promise<NotificationItem[]> => {
  const idsOf = (type: Notification['type']) =>
    rows.filter((row) => row.type === type).map((row) => row.notificationId);
  const [likes, follows, reacts, replies] = await Promise.all([
    rowsByNotificationId(
      idsOf('like'),
      (ids) => db.select().from(notificationLikesTable).where(inArray(notificationLikesTable.notificationId, ids)),
    ),
    rowsByNotificationId(
      idsOf('follow'),
      (ids) => db.select().from(notificationFollowsTable).where(inArray(notificationFollowsTable.notificationId, ids)),
    ),
    rowsByNotificationId(
      idsOf('emojiReact'),
      (ids) =>
        db.select().from(notificationEmojiReactsTable).where(inArray(notificationEmojiReactsTable.notificationId, ids)),
    ),
    rowsByNotificationId(
      idsOf('reply'),
      (ids) => db.select().from(notificationRepliesTable).where(inArray(notificationRepliesTable.notificationId, ids)),
    ),
  ]);

  return rows.flatMap((row): NotificationItem[] => {
    const base = {
      notificationId: NotificationId.orThrow(row.notificationId),
      recipientUserId: UserId.orThrow(row.recipientUserId),
      isRead: row.isRead === 1,
    };
    const toItem = (notification: Notification): NotificationItem[] => [{
      notification,
      createdAt: Instant.orThrow(row.createdAt.getTime()),
    }];
    const like = likes.get(row.notificationId);
    const follow = follows.get(row.notificationId);
    const react = reacts.get(row.notificationId);
    const reply = replies.get(row.notificationId);
    if (row.type === 'like' && like !== undefined) {
      return toItem({
        ...base,
        type: 'like',
        likerActorId: ActorId.orThrow(like.likerActorId),
        likedPostId: PostId.orThrow(like.likedPostId),
      });
    }
    if (row.type === 'follow' && follow !== undefined) {
      return toItem({ ...base, type: 'follow', followerActorId: ActorId.orThrow(follow.followerActorId) });
    }
    if (row.type === 'emojiReact' && react !== undefined) {
      return toItem({
        ...base,
        type: 'emojiReact',
        reactorActorId: ActorId.orThrow(react.reactorActorId),
        reactedPostId: PostId.orThrow(react.reactedPostId),
        emoji: react.emoji,
        emojiImageUrl: react.emojiImageUrl,
      });
    }
    if (row.type === 'reply' && reply !== undefined) {
      return toItem({
        ...base,
        type: 'reply',
        replierActorId: ActorId.orThrow(reply.replierActorId),
        replyPostId: PostId.orThrow(reply.replyPostId),
        originalPostId: PostId.orThrow(reply.originalPostId),
      });
    }
    return [];
  });
};
