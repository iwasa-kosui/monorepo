import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type {
  EmojiReactNotification,
  EmojiReactNotificationCreatedStore,
  EmojiReactNotificationDeletedStore,
  EmojiReactNotificationResolverByActorIdAndPostIdAndEmoji,
  EmojiReactNotificationsResolverByPostId,
  FollowNotificationCreatedStore,
  LikeNotification,
  LikeNotificationCreatedStore,
  LikeNotificationDeletedStore,
  LikeNotificationResolverByActorIdAndPostId,
  LikeNotificationsResolverByPostId,
  ReplyNotification,
  ReplyNotificationCreatedStore,
  ReplyNotificationDeletedStore,
  ReplyNotificationsResolverByOriginalPostId,
  ReplyNotificationsResolverByReplyPostId,
} from '../../../domain/notification/notification.ts';
import { NotificationId } from '../../../domain/notification/notificationId.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import {
  domainEventsTable,
  notificationEmojiReactsTable,
  notificationFollowsTable,
  notificationLikesTable,
  notificationRepliesTable,
  notificationsTable,
} from '../schema.ts';

const eventRow = (event: {
  eventId: string;
  aggregateId: unknown;
  aggregateName: string;
  aggregateState: unknown;
  eventName: string;
  eventPayload: unknown;
  occurredAt: number;
}) => ({
  eventId: event.eventId,
  aggregateId: JSON.stringify(event.aggregateId),
  aggregateName: event.aggregateName,
  aggregateState: event.aggregateState === undefined ? null : JSON.stringify(event.aggregateState),
  eventName: event.eventName,
  eventPayload: JSON.stringify(event.eventPayload),
  occurredAt: new Date(event.occurredAt),
});

const notificationRow = (
  notification: { notificationId: string; recipientUserId: string; type: string; isRead: boolean },
  createdAt: number,
) => ({
  notificationId: notification.notificationId,
  recipientUserId: notification.recipientUserId,
  type: notification.type,
  isRead: notification.isRead ? 1 : 0,
  createdAt: new Date(createdAt),
});

export const createD1FollowNotificationCreatedStore = (db: IoriD1Db): FollowNotificationCreatedStore => ({
  store: async (event) => {
    await db.batch([
      db.insert(notificationsTable).values(notificationRow(event.aggregateState, event.occurredAt)),
      db.insert(notificationFollowsTable).values({
        notificationId: event.aggregateState.notificationId,
        followerActorId: event.aggregateState.followerActorId,
      }),
      db.insert(domainEventsTable).values(eventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});

export const createD1LikeNotificationCreatedStore = (db: IoriD1Db): LikeNotificationCreatedStore => ({
  store: async (event) => {
    await db.batch([
      db.insert(notificationsTable).values(notificationRow(event.aggregateState, event.occurredAt)),
      db.insert(notificationLikesTable).values({
        notificationId: event.aggregateState.notificationId,
        likerActorId: event.aggregateState.likerActorId,
        likedPostId: event.aggregateState.likedPostId,
      }),
      db.insert(domainEventsTable).values(eventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});

export const createD1EmojiReactNotificationCreatedStore = (db: IoriD1Db): EmojiReactNotificationCreatedStore => ({
  store: async (event) => {
    await db.batch([
      db.insert(notificationsTable).values(notificationRow(event.aggregateState, event.occurredAt)),
      db.insert(notificationEmojiReactsTable).values({
        notificationId: event.aggregateState.notificationId,
        reactorActorId: event.aggregateState.reactorActorId,
        reactedPostId: event.aggregateState.reactedPostId,
        emoji: event.aggregateState.emoji,
        emojiImageUrl: event.aggregateState.emojiImageUrl,
      }),
      db.insert(domainEventsTable).values(eventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});

export const createD1ReplyNotificationCreatedStore = (db: IoriD1Db): ReplyNotificationCreatedStore => ({
  store: async (event) => {
    await db.batch([
      db.insert(notificationsTable).values(notificationRow(event.aggregateState, event.occurredAt)),
      db.insert(notificationRepliesTable).values({
        notificationId: event.aggregateState.notificationId,
        replierActorId: event.aggregateState.replierActorId,
        replyPostId: event.aggregateState.replyPostId,
        originalPostId: event.aggregateState.originalPostId,
      }),
      db.insert(domainEventsTable).values(eventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});

const createDeletedStore = <
  TEvent extends {
    eventId: string;
    aggregateId: unknown;
    aggregateName: string;
    aggregateState: undefined;
    eventName: string;
    eventPayload: { notificationId: string };
    occurredAt: number;
  },
>(
  db: IoriD1Db,
  subtypeTable: typeof notificationLikesTable | typeof notificationEmojiReactsTable | typeof notificationRepliesTable,
) =>
async (...events: readonly TEvent[]) => {
  if (events.length === 0) return RA.ok(undefined);
  const ids = events.map((event) => event.eventPayload.notificationId);
  await db.batch([
    db.delete(subtypeTable).where(inArray(subtypeTable.notificationId, ids)),
    db.delete(notificationsTable).where(inArray(notificationsTable.notificationId, ids)),
    ...events.map((event) => db.insert(domainEventsTable).values(eventRow(event))),
  ]);
  return RA.ok(undefined);
};

export const createD1LikeNotificationDeletedStore = (db: IoriD1Db): LikeNotificationDeletedStore => ({
  store: createDeletedStore(db, notificationLikesTable),
});
export const createD1EmojiReactNotificationDeletedStore = (db: IoriD1Db): EmojiReactNotificationDeletedStore => ({
  store: createDeletedStore(db, notificationEmojiReactsTable),
});
export const createD1ReplyNotificationDeletedStore = (db: IoriD1Db): ReplyNotificationDeletedStore => ({
  store: createDeletedStore(db, notificationRepliesTable),
});

type LikeRow = {
  notifications: typeof notificationsTable.$inferSelect;
  notification_likes: typeof notificationLikesTable.$inferSelect;
};
const toLike = (row: LikeRow): LikeNotification => ({
  type: 'like',
  notificationId: NotificationId.orThrow(row.notifications.notificationId),
  recipientUserId: row.notifications.recipientUserId as UserId,
  isRead: row.notifications.isRead === 1,
  likerActorId: row.notification_likes.likerActorId as ActorId,
  likedPostId: row.notification_likes.likedPostId as PostId,
});
const likeQuery = (db: IoriD1Db) =>
  db.select().from(notificationLikesTable)
    .innerJoin(notificationsTable, eq(notificationLikesTable.notificationId, notificationsTable.notificationId));

export const createD1LikeNotificationResolverByActorIdAndPostId = (
  db: IoriD1Db,
): LikeNotificationResolverByActorIdAndPostId => ({
  resolve: async ({ likerActorId, likedPostId }) => {
    const [row] = await likeQuery(db).where(
      and(eq(notificationLikesTable.likerActorId, likerActorId), eq(notificationLikesTable.likedPostId, likedPostId)),
    ).limit(1);
    return RA.ok(row === undefined ? undefined : toLike(row));
  },
});
export const createD1LikeNotificationsResolverByPostId = (db: IoriD1Db): LikeNotificationsResolverByPostId => ({
  resolve: async ({ postId }) =>
    RA.ok((await likeQuery(db).where(eq(notificationLikesTable.likedPostId, postId))).map(toLike)),
});

type EmojiRow = {
  notifications: typeof notificationsTable.$inferSelect;
  notification_emoji_reacts: typeof notificationEmojiReactsTable.$inferSelect;
};
const toEmoji = (row: EmojiRow): EmojiReactNotification => ({
  type: 'emojiReact',
  notificationId: NotificationId.orThrow(row.notifications.notificationId),
  recipientUserId: row.notifications.recipientUserId as UserId,
  isRead: row.notifications.isRead === 1,
  reactorActorId: row.notification_emoji_reacts.reactorActorId as ActorId,
  reactedPostId: row.notification_emoji_reacts.reactedPostId as PostId,
  emoji: row.notification_emoji_reacts.emoji,
  emojiImageUrl: row.notification_emoji_reacts.emojiImageUrl,
});
const emojiQuery = (db: IoriD1Db) =>
  db.select().from(notificationEmojiReactsTable)
    .innerJoin(notificationsTable, eq(notificationEmojiReactsTable.notificationId, notificationsTable.notificationId));

export const createD1EmojiReactNotificationResolverByActorIdAndPostIdAndEmoji = (
  db: IoriD1Db,
): EmojiReactNotificationResolverByActorIdAndPostIdAndEmoji => ({
  resolve: async ({ reactorActorId, reactedPostId, emoji }) => {
    const [row] = await emojiQuery(db).where(
      and(
        eq(notificationEmojiReactsTable.reactorActorId, reactorActorId),
        eq(notificationEmojiReactsTable.reactedPostId, reactedPostId),
        eq(notificationEmojiReactsTable.emoji, emoji),
      ),
    ).limit(1);
    return RA.ok(row === undefined ? undefined : toEmoji(row));
  },
});
export const createD1EmojiReactNotificationsResolverByPostId = (
  db: IoriD1Db,
): EmojiReactNotificationsResolverByPostId => ({
  resolve: async ({ postId }) =>
    RA.ok((await emojiQuery(db).where(eq(notificationEmojiReactsTable.reactedPostId, postId))).map(toEmoji)),
});

type ReplyRow = {
  notifications: typeof notificationsTable.$inferSelect;
  notification_replies: typeof notificationRepliesTable.$inferSelect;
};
const toReply = (row: ReplyRow): ReplyNotification => ({
  type: 'reply',
  notificationId: NotificationId.orThrow(row.notifications.notificationId),
  recipientUserId: row.notifications.recipientUserId as UserId,
  isRead: row.notifications.isRead === 1,
  replierActorId: row.notification_replies.replierActorId as ActorId,
  replyPostId: row.notification_replies.replyPostId as PostId,
  originalPostId: row.notification_replies.originalPostId as PostId,
});
const replyQuery = (db: IoriD1Db) =>
  db.select().from(notificationRepliesTable)
    .innerJoin(notificationsTable, eq(notificationRepliesTable.notificationId, notificationsTable.notificationId));

export const createD1ReplyNotificationsResolverByReplyPostId = (
  db: IoriD1Db,
): ReplyNotificationsResolverByReplyPostId => ({
  resolve: async ({ replyPostId }) =>
    RA.ok((await replyQuery(db).where(eq(notificationRepliesTable.replyPostId, replyPostId))).map(toReply)),
});
export const createD1ReplyNotificationsResolverByOriginalPostId = (
  db: IoriD1Db,
): ReplyNotificationsResolverByOriginalPostId => ({
  resolve: async ({ originalPostId }) =>
    RA.ok((await replyQuery(db).where(eq(notificationRepliesTable.originalPostId, originalPostId))).map(toReply)),
});
