import { index, integer, json, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

export const usersTable = pgTable('users', {
  userId: uuid().primaryKey(),
  username: varchar({ length: 255 }).notNull().unique(),
});

export const keysTable = pgTable('keys', {
  keyId: uuid().primaryKey(),
  userId: uuid()
    .notNull()
    .references(() => usersTable.userId),
  type: varchar({ length: 32 })
    .notNull(),
  privateKey: text()
    .notNull(),
  publicKey: text()
    .notNull(),
}, (table) => [
  unique('user_key_type_unique').on(table.userId, table.type),
]);

export const domainEventsTable = pgTable('domain_events', {
  eventId: uuid().primaryKey(),
  aggregateId: json().notNull(),
  aggregateName: varchar({ length: 128 }).notNull(),
  aggregateState: json(),
  eventName: varchar({ length: 128 }).notNull(),
  eventPayload: json(),
  occurredAt: timestamp({ mode: 'date' }).notNull(),
});

export const actorsTable = pgTable('actors', {
  actorId: uuid().primaryKey(),
  uri: text().notNull().unique(),
  logoUri: text(),
  inboxUrl: text().notNull().unique(),
  type: varchar({ length: 32 }).notNull(),
});

export const localActorsTable = pgTable('local_actors', {
  actorId: uuid().primaryKey().references(() => actorsTable.actorId),
  userId: uuid().notNull().references(() => usersTable.userId),
}, (t) => [
  unique('local_actor_user_unique').on(t.userId),
]);

export const remoteActorsTable = pgTable('remote_actors', {
  actorId: uuid().primaryKey().references(() => actorsTable.actorId),
  url: text(),
  username: text(),
});

export const followsTable = pgTable('follows', {
  followerId: uuid()
    .notNull()
    .references(() => actorsTable.actorId),
  followingId: uuid()
    .notNull()
    .references(() => actorsTable.actorId),
}, (table) => [
  unique('follower_following_unique').on(table.followerId, table.followingId),
]);

export const userPasswordsTable = pgTable('user_passwords', {
  userId: uuid().primaryKey().references(() => usersTable.userId),
  algorithm: varchar({ length: 32 }).notNull(),
  parallelism: integer().notNull(),
  tagLength: integer().notNull(),
  memory: integer().notNull(),
  passes: integer().notNull(),
  nonceHex: text().notNull(),
  tagHex: text().notNull(),
});

export const sessionsTable = pgTable('sessions', {
  sessionId: uuid().primaryKey(),
  userId: uuid().notNull().references(() => usersTable.userId),
  expires: timestamp({ mode: 'date' }).notNull(),
});

export const postsTable = pgTable('posts', {
  postId: uuid().primaryKey(),
  actorId: uuid().notNull().references(() => actorsTable.actorId),
  content: text().notNull(),
  createdAt: timestamp({ mode: 'date' }).notNull(),
  type: varchar({ length: 32 }).notNull(),
  deletedAt: timestamp({ mode: 'date' }),
});

export const remotePostsTable = pgTable('remote_posts', {
  postId: uuid().primaryKey().references(() => postsTable.postId),
  uri: text().notNull().unique(),
  inReplyToUri: text(),
});

export const localPostsTable = pgTable('local_posts', {
  postId: uuid().primaryKey().references(() => postsTable.postId),
  userId: uuid().notNull().references(() => usersTable.userId),
  inReplyToUri: text(),
});

export const likesTable = pgTable('likes', {
  likeId: uuid().primaryKey(),
  actorId: uuid().notNull().references(() => actorsTable.actorId),
  postId: uuid().notNull().references(() => postsTable.postId),
  createdAt: timestamp({ mode: 'date' }).notNull(),
}, (table) => [
  unique('like_actor_post_unique').on(table.actorId, table.postId),
]);

export const likesV2Table = pgTable('likes_v2', {
  likeId: uuid().primaryKey(),
  actorId: uuid().notNull().references(() => actorsTable.actorId),
  postId: uuid().notNull().references(() => postsTable.postId),
  likeActivityUri: text().unique(),
  createdAt: timestamp({ mode: 'date' }).notNull(),
}, (table) => [
  unique('likes_v2_actor_post_unique').on(table.actorId, table.postId),
]);

export const postImagesTable = pgTable('post_images', {
  imageId: uuid().primaryKey(),
  postId: uuid().notNull().references(() => postsTable.postId),
  url: text().notNull(),
  altText: text(),
  createdAt: timestamp({ mode: 'date' }).notNull(),
});

export const notificationsTable = pgTable('notifications', {
  notificationId: uuid().primaryKey(),
  recipientUserId: uuid().notNull().references(() => usersTable.userId),
  type: varchar({ length: 32 }).notNull(),
  isRead: integer().notNull().default(0),
  createdAt: timestamp({ mode: 'date' }).notNull(),
});

export const notificationLikesTable = pgTable('notification_likes', {
  notificationId: uuid().primaryKey().references(() => notificationsTable.notificationId),
  likerActorId: uuid().notNull().references(() => actorsTable.actorId),
  likedPostId: uuid().notNull(),
});

export const notificationFollowsTable = pgTable('notification_follows', {
  notificationId: uuid().primaryKey().references(() => notificationsTable.notificationId),
  followerActorId: uuid().notNull().references(() => actorsTable.actorId),
});

export const pushSubscriptionsTable = pgTable('push_subscriptions', {
  subscriptionId: uuid().primaryKey(),
  userId: uuid().notNull().references(() => usersTable.userId),
  endpoint: text().notNull().unique(),
  p256dhKey: text().notNull(),
  authKey: text().notNull(),
  createdAt: timestamp({ mode: 'date' }).notNull(),
});

export const repostsTable = pgTable('reposts', {
  repostId: uuid().primaryKey(),
  actorId: uuid().notNull().references(() => actorsTable.actorId),
  postId: uuid().notNull().references(() => postsTable.postId),
  announceActivityUri: text().unique(),
  createdAt: timestamp({ mode: 'date' }).notNull(),
}, (table) => [
  unique('repost_actor_post_unique').on(table.actorId, table.postId),
]);

export const timelineItemsTable = pgTable('timeline_items', {
  timelineItemId: uuid().primaryKey(),
  type: varchar({ length: 16 }).notNull(),
  actorId: uuid().notNull().references(() => actorsTable.actorId),
  postId: uuid().notNull(),
  repostId: uuid(),
  createdAt: timestamp({ mode: 'date' }).notNull(),
  deletedAt: timestamp({ mode: 'date' }),
});

/**
 * Stores key pairs for the instance actor.
 * The instance actor is a special Application actor that represents the server
 * and is used for authenticated requests from the shared inbox.
 */
export const instanceActorKeysTable = pgTable('instance_actor_keys', {
  keyId: uuid().primaryKey(),
  type: varchar({ length: 32 }).notNull().unique(),
  privateKey: text().notNull(),
  publicKey: text().notNull(),
});

export const emojiReactsTable = pgTable('emoji_reacts', {
  emojiReactId: uuid().primaryKey(),
  actorId: uuid().notNull().references(() => actorsTable.actorId),
  postId: uuid().notNull().references(() => postsTable.postId),
  emoji: varchar({ length: 128 }).notNull(),
  emojiReactActivityUri: text().unique(),
  emojiImageUrl: text(),
  createdAt: timestamp({ mode: 'date' }).notNull(),
}, (table) => [
  unique('emoji_react_actor_post_emoji_unique').on(table.actorId, table.postId, table.emoji),
]);

export const notificationEmojiReactsTable = pgTable('notification_emoji_reacts', {
  notificationId: uuid().primaryKey().references(() => notificationsTable.notificationId),
  reactorActorId: uuid().notNull().references(() => actorsTable.actorId),
  reactedPostId: uuid().notNull(),
  emoji: varchar({ length: 128 }).notNull(),
  emojiImageUrl: text(),
});

export const notificationRepliesTable = pgTable('notification_replies', {
  notificationId: uuid().primaryKey().references(() => notificationsTable.notificationId),
  replierActorId: uuid().notNull().references(() => actorsTable.actorId),
  replyPostId: uuid().notNull(),
  originalPostId: uuid().notNull(),
}, (table) => [
  index('notification_replies_reply_post_id_idx').on(table.replyPostId),
  index('notification_replies_original_post_id_idx').on(table.originalPostId),
]);

export const mutesTable = pgTable('mutes', {
  muteId: uuid().primaryKey(),
  userId: uuid().notNull().references(() => usersTable.userId),
  mutedActorId: uuid().notNull().references(() => actorsTable.actorId),
  createdAt: timestamp({ mode: 'date' }).notNull(),
}, (table) => [
  unique('mute_user_actor_unique').on(table.userId, table.mutedActorId),
  index('mutes_user_id_idx').on(table.userId),
  index('mutes_muted_actor_id_idx').on(table.mutedActorId),
]);
