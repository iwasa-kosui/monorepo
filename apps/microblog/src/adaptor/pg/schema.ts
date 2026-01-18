import { integer, json, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

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
});

export const localPostsTable = pgTable('local_posts', {
  postId: uuid().primaryKey().references(() => postsTable.postId),
  userId: uuid().notNull().references(() => usersTable.userId),
});

export const likesTable = pgTable('likes', {
  likeId: uuid().primaryKey(),
  actorId: uuid().notNull().references(() => actorsTable.actorId),
  objectUri: text().notNull(),
  createdAt: timestamp({ mode: 'date' }).notNull(),
}, (table) => [
  unique('actor_object_unique').on(table.actorId, table.objectUri),
]);

export const likesV2Table = pgTable('likes_v2', {
  likeId: uuid().primaryKey(),
  actorId: uuid().notNull().references(() => actorsTable.actorId),
  objectUri: text().notNull(),
  likeActivityUri: text().unique(),
  createdAt: timestamp({ mode: 'date' }).notNull(),
}, (table) => [
  unique('likes_v2_actor_object_unique').on(table.actorId, table.objectUri),
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
  likedPostId: uuid().notNull().references(() => postsTable.postId),
});

export const notificationFollowsTable = pgTable('notification_follows', {
  notificationId: uuid().primaryKey().references(() => notificationsTable.notificationId),
  followerActorId: uuid().notNull().references(() => actorsTable.actorId),
});

export const notificationRepostsTable = pgTable('notification_reposts', {
  notificationId: uuid().primaryKey().references(() => notificationsTable.notificationId),
  reposterActorId: uuid().notNull().references(() => actorsTable.actorId),
  repostedPostId: uuid().notNull().references(() => postsTable.postId),
  repostId: uuid().notNull().references(() => repostsTable.repostId),
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
  objectUri: text().notNull(),
  originalPostId: uuid().references(() => postsTable.postId),
  announceActivityUri: text().unique(),
  createdAt: timestamp({ mode: 'date' }).notNull(),
}, (table) => [
  unique('repost_actor_object_unique').on(table.actorId, table.objectUri),
]);

export const timelineItemsTable = pgTable('timeline_items', {
  timelineItemId: uuid().primaryKey(),
  type: varchar({ length: 16 }).notNull(),
  actorId: uuid().notNull().references(() => actorsTable.actorId),
  postId: uuid().notNull().references(() => postsTable.postId),
  repostId: uuid().references(() => repostsTable.repostId),
  createdAt: timestamp({ mode: 'date' }).notNull(),
  deletedAt: timestamp({ mode: 'date' }),
});
