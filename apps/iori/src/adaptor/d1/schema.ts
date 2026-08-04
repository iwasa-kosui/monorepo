import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamp = () => integer({ mode: 'timestamp_ms' });

export const usersTable = sqliteTable('users', {
  userId: text('userId').primaryKey(),
  username: text('username').notNull(),
}, (table) => [
  uniqueIndex('users_username_unique').on(table.username),
]);

export const keysTable = sqliteTable('keys', {
  keyId: text('keyId').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => usersTable.userId),
  type: text('type').notNull(),
  privateKey: text('privateKey').notNull(),
  publicKey: text('publicKey').notNull(),
}, (table) => [
  uniqueIndex('user_key_type_unique').on(table.userId, table.type),
]);

export const domainEventsTable = sqliteTable('domain_events', {
  eventId: text('eventId').primaryKey(),
  aggregateId: text('aggregateId').notNull(),
  aggregateName: text('aggregateName').notNull(),
  aggregateState: text('aggregateState'),
  eventName: text('eventName').notNull(),
  eventPayload: text('eventPayload'),
  occurredAt: timestamp().notNull(),
});

export const actorsTable = sqliteTable('actors', {
  actorId: text('actorId').primaryKey(),
  uri: text('uri').notNull(),
  logoUri: text('logoUri'),
  inboxUrl: text('inboxUrl').notNull(),
  type: text('type').notNull(),
}, (table) => [
  uniqueIndex('actors_uri_unique').on(table.uri),
  uniqueIndex('actors_inboxUrl_unique').on(table.inboxUrl),
]);

export const localActorsTable = sqliteTable('local_actors', {
  actorId: text('actorId').primaryKey().references(() => actorsTable.actorId),
  userId: text('userId').notNull().references(() => usersTable.userId),
}, (table) => [
  uniqueIndex('local_actor_user_unique').on(table.userId),
]);

export const remoteActorsTable = sqliteTable('remote_actors', {
  actorId: text('actorId').primaryKey().references(() => actorsTable.actorId),
  url: text('url'),
  username: text('username'),
});

export const followsTable = sqliteTable('follows', {
  followerId: text('followerId')
    .notNull()
    .references(() => actorsTable.actorId),
  followingId: text('followingId')
    .notNull()
    .references(() => actorsTable.actorId),
}, (table) => [
  uniqueIndex('follower_following_unique').on(table.followerId, table.followingId),
]);

export const userPasswordsTable = sqliteTable('user_passwords', {
  userId: text('userId').primaryKey().references(() => usersTable.userId),
  algorithm: text('algorithm').notNull(),
  parallelism: integer('parallelism').notNull(),
  tagLength: integer('tagLength').notNull(),
  memory: integer('memory').notNull(),
  passes: integer('passes').notNull(),
  nonceHex: text('nonceHex').notNull(),
  tagHex: text('tagHex').notNull(),
});

export const sessionsTable = sqliteTable('sessions', {
  sessionId: text('sessionId').primaryKey(),
  userId: text('userId').notNull().references(() => usersTable.userId),
  expires: timestamp().notNull(),
});

export const postsTable = sqliteTable('posts', {
  postId: text('postId').primaryKey(),
  actorId: text('actorId').notNull().references(() => actorsTable.actorId),
  content: text('content').notNull(),
  createdAt: timestamp().notNull(),
  type: text('type').notNull(),
  deletedAt: timestamp(),
});

export const remotePostsTable = sqliteTable('remote_posts', {
  postId: text('postId').primaryKey().references(() => postsTable.postId),
  uri: text('uri').notNull(),
  inReplyToUri: text('inReplyToUri'),
}, (table) => [
  uniqueIndex('remote_posts_uri_unique').on(table.uri),
]);

export const localPostsTable = sqliteTable('local_posts', {
  postId: text('postId').primaryKey().references(() => postsTable.postId),
  userId: text('userId').notNull().references(() => usersTable.userId),
  inReplyToUri: text('inReplyToUri'),
});

export const likesTable = sqliteTable('likes', {
  likeId: text('likeId').primaryKey(),
  actorId: text('actorId').notNull().references(() => actorsTable.actorId),
  postId: text('postId').notNull().references(() => postsTable.postId),
  type: text('type').notNull(),
  createdAt: timestamp().notNull(),
}, (table) => [
  uniqueIndex('like_actor_post_unique').on(table.actorId, table.postId),
]);

export const localLikesTable = sqliteTable('local_likes', {
  likeId: text('likeId').primaryKey().references(() => likesTable.likeId),
});

export const remoteLikesTable = sqliteTable('remote_likes', {
  likeId: text('likeId').primaryKey().references(() => likesTable.likeId),
  likeActivityUri: text('likeActivityUri').notNull(),
}, (table) => [
  uniqueIndex('remote_likes_likeActivityUri_unique').on(table.likeActivityUri),
]);

export const postImagesTable = sqliteTable('post_images', {
  imageId: text('imageId').primaryKey(),
  postId: text('postId').notNull().references(() => postsTable.postId),
  url: text('url').notNull(),
  altText: text('altText'),
  createdAt: timestamp().notNull(),
});

export const notificationsTable = sqliteTable('notifications', {
  notificationId: text('notificationId').primaryKey(),
  recipientUserId: text('recipientUserId').notNull().references(() => usersTable.userId),
  type: text('type').notNull(),
  isRead: integer('isRead').notNull().default(0),
  createdAt: timestamp().notNull(),
});

export const notificationLikesTable = sqliteTable('notification_likes', {
  notificationId: text('notificationId').primaryKey().references(() => notificationsTable.notificationId),
  likerActorId: text('likerActorId').notNull().references(() => actorsTable.actorId),
  likedPostId: text('likedPostId').notNull(),
});

export const notificationFollowsTable = sqliteTable('notification_follows', {
  notificationId: text('notificationId').primaryKey().references(() => notificationsTable.notificationId),
  followerActorId: text('followerActorId').notNull().references(() => actorsTable.actorId),
});

export const pushSubscriptionsTable = sqliteTable('push_subscriptions', {
  subscriptionId: text('subscriptionId').primaryKey(),
  userId: text('userId').notNull().references(() => usersTable.userId),
  endpoint: text('endpoint').notNull(),
  p256dhKey: text('p256dhKey').notNull(),
  authKey: text('authKey').notNull(),
  createdAt: timestamp().notNull(),
}, (table) => [
  uniqueIndex('push_subscriptions_endpoint_unique').on(table.endpoint),
]);

export const repostsTable = sqliteTable('reposts', {
  repostId: text('repostId').primaryKey(),
  actorId: text('actorId').notNull().references(() => actorsTable.actorId),
  postId: text('postId').notNull().references(() => postsTable.postId),
  announceActivityUri: text('announceActivityUri'),
  createdAt: timestamp().notNull(),
}, (table) => [
  uniqueIndex('repost_actor_post_unique').on(table.actorId, table.postId),
  uniqueIndex('reposts_announceActivityUri_unique').on(table.announceActivityUri),
]);

export const timelineItemsTable = sqliteTable('timeline_items', {
  timelineItemId: text('timelineItemId').primaryKey(),
  type: text('type').notNull(),
  actorId: text('actorId').notNull().references(() => actorsTable.actorId),
  postId: text('postId').notNull(),
  repostId: text('repostId'),
  createdAt: timestamp().notNull(),
  deletedAt: timestamp(),
});

export const instanceActorKeysTable = sqliteTable('instance_actor_keys', {
  keyId: text('keyId').primaryKey(),
  type: text('type').notNull(),
  privateKey: text('privateKey').notNull(),
  publicKey: text('publicKey').notNull(),
}, (table) => [
  uniqueIndex('instance_actor_keys_type_unique').on(table.type),
]);

export const emojiReactsTable = sqliteTable('emoji_reacts', {
  emojiReactId: text('emojiReactId').primaryKey(),
  actorId: text('actorId').notNull().references(() => actorsTable.actorId),
  postId: text('postId').notNull().references(() => postsTable.postId),
  emoji: text('emoji').notNull(),
  emojiReactActivityUri: text('emojiReactActivityUri'),
  emojiImageUrl: text('emojiImageUrl'),
  createdAt: timestamp().notNull(),
}, (table) => [
  uniqueIndex('emoji_react_actor_post_emoji_unique').on(table.actorId, table.postId, table.emoji),
  uniqueIndex('emoji_reacts_emojiReactActivityUri_unique').on(table.emojiReactActivityUri),
]);

export const notificationEmojiReactsTable = sqliteTable('notification_emoji_reacts', {
  notificationId: text('notificationId').primaryKey().references(() => notificationsTable.notificationId),
  reactorActorId: text('reactorActorId').notNull().references(() => actorsTable.actorId),
  reactedPostId: text('reactedPostId').notNull(),
  emoji: text('emoji').notNull(),
  emojiImageUrl: text('emojiImageUrl'),
});

export const notificationRepliesTable = sqliteTable('notification_replies', {
  notificationId: text('notificationId').primaryKey().references(() => notificationsTable.notificationId),
  replierActorId: text('replierActorId').notNull().references(() => actorsTable.actorId),
  replyPostId: text('replyPostId').notNull(),
  originalPostId: text('originalPostId').notNull(),
}, (table) => [
  index('notification_replies_reply_post_id_idx').on(table.replyPostId),
  index('notification_replies_original_post_id_idx').on(table.originalPostId),
]);

export const mutesTable = sqliteTable('mutes', {
  muteId: text('muteId').primaryKey(),
  userId: text('userId').notNull().references(() => usersTable.userId),
  mutedActorId: text('mutedActorId').notNull().references(() => actorsTable.actorId),
  createdAt: timestamp().notNull(),
}, (table) => [
  uniqueIndex('mute_user_actor_unique').on(table.userId, table.mutedActorId),
  index('mutes_user_id_idx').on(table.userId),
  index('mutes_muted_actor_id_idx').on(table.mutedActorId),
]);

export const articlesTable = sqliteTable('articles', {
  articleId: text('articleId').primaryKey(),
  authorActorId: text('authorActorId').notNull().references(() => actorsTable.actorId),
  authorUserId: text('authorUserId').notNull().references(() => usersTable.userId),
  rootPostId: text('rootPostId').notNull().references(() => postsTable.postId),
  title: text('title').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp().notNull(),
  publishedAt: timestamp(),
  unpublishedAt: timestamp(),
}, (table) => [
  index('articles_author_actor_id_idx').on(table.authorActorId),
  index('articles_root_post_id_idx').on(table.rootPostId),
  uniqueIndex('article_root_post_unique').on(table.rootPostId),
]);

export const linkPreviewsTable = sqliteTable('link_previews', {
  linkPreviewId: text('linkPreviewId').primaryKey(),
  postId: text('postId').notNull().references(() => postsTable.postId, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  title: text('title'),
  description: text('description'),
  imageUrl: text('imageUrl'),
  faviconUrl: text('faviconUrl'),
  siteName: text('siteName'),
  createdAt: timestamp().notNull(),
}, (table) => [
  index('link_previews_post_id_idx').on(table.postId),
]);

export const relaysTable = sqliteTable('relays', {
  relayId: text('relayId').primaryKey(),
  inboxUrl: text('inboxUrl').notNull(),
  actorUri: text('actorUri').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp().notNull(),
  acceptedAt: timestamp(),
}, (table) => [
  uniqueIndex('relays_inboxUrl_unique').on(table.inboxUrl),
  uniqueIndex('relays_actorUri_unique').on(table.actorUri),
]);

export const federatedTimelineItemsTable = sqliteTable('federated_timeline_items', {
  federatedTimelineItemId: text('federatedTimelineItemId').primaryKey(),
  postId: text('postId').notNull().references(() => postsTable.postId),
  relayId: text('relayId').notNull().references(() => relaysTable.relayId),
  receivedAt: timestamp().notNull(),
}, (table) => [
  index('federated_timeline_items_received_at_idx').on(table.receivedAt),
  index('federated_timeline_items_post_id_idx').on(table.postId),
]);

export const schema = {
  usersTable,
  keysTable,
  domainEventsTable,
  actorsTable,
  localActorsTable,
  remoteActorsTable,
  followsTable,
  userPasswordsTable,
  sessionsTable,
  postsTable,
  remotePostsTable,
  localPostsTable,
  likesTable,
  localLikesTable,
  remoteLikesTable,
  postImagesTable,
  notificationsTable,
  notificationLikesTable,
  notificationFollowsTable,
  pushSubscriptionsTable,
  repostsTable,
  timelineItemsTable,
  instanceActorKeysTable,
  emojiReactsTable,
  notificationEmojiReactsTable,
  notificationRepliesTable,
  mutesTable,
  articlesTable,
  linkPreviewsTable,
  relaysTable,
  federatedTimelineItemsTable,
} as const;
