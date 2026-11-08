import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { embeddingBlob } from './embeddingColumn.ts';

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
}, (table) => [
  index('domain_events_aggregate_id_idx').on(table.aggregateId),
  index('domain_events_occurred_at_idx').on(table.occurredAt, table.eventId),
]);

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
  displayName: text('displayName'),
  summary: text('summary'),
  headerUri: text('headerUri'),
  actorType: text('actorType'),
  manuallyApprovesFollowers: integer('manuallyApprovesFollowers', { mode: 'boolean' }),
  publishedAt: integer('publishedAt', { mode: 'timestamp_ms' }),
  fields: text('fields'),
  emojis: text('emojis'),
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
  index('follows_following_id_idx').on(table.followingId),
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
  summary: text('summary'),
  sensitive: integer('sensitive', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('posts_actor_id_idx').on(table.actorId),
  index('posts_created_at_post_id_idx').on(table.createdAt, table.postId),
  index('posts_actor_id_created_at_post_id_idx').on(table.actorId, table.createdAt, table.postId),
]);

export const remotePostsTable = sqliteTable('remote_posts', {
  postId: text('postId').primaryKey().references(() => postsTable.postId),
  uri: text('uri').notNull(),
  inReplyToUri: text('inReplyToUri'),
  visibility: text('visibility'),
}, (table) => [
  uniqueIndex('remote_posts_uri_unique').on(table.uri),
  index('remote_posts_in_reply_to_uri_idx').on(table.inReplyToUri),
]);

export const remotePostRecipientsTable = sqliteTable('remote_post_recipients', {
  postId: text('postId').notNull().references(() => postsTable.postId),
  actorUri: text('actorUri').notNull(),
}, (table) => [
  primaryKey({ columns: [table.postId, table.actorUri] }),
  index('remote_post_recipients_actor_uri_idx').on(table.actorUri),
]);

export const localPostsTable = sqliteTable('local_posts', {
  postId: text('postId').primaryKey().references(() => postsTable.postId),
  userId: text('userId').notNull().references(() => usersTable.userId),
  inReplyToUri: text('inReplyToUri'),
}, (table) => [
  index('local_posts_in_reply_to_uri_idx').on(table.inReplyToUri),
]);

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

export const mediaUploadsTable = sqliteTable('media_uploads', {
  mediaId: text('mediaId').primaryKey(),
  userId: text('userId').notNull().references(() => usersTable.userId),
  url: text('url').notNull(),
  mimeType: text('mimeType').notNull(),
  description: text('description'),
  createdAt: timestamp().notNull(),
}, (table) => [
  index('media_uploads_user_id_idx').on(table.userId),
]);

export const notificationsTable = sqliteTable('notifications', {
  notificationId: text('notificationId').primaryKey(),
  recipientUserId: text('recipientUserId').notNull().references(() => usersTable.userId),
  type: text('type').notNull(),
  isRead: integer('isRead').notNull().default(0),
  createdAt: timestamp().notNull(),
}, (table) => [
  index('notifications_recipient_user_id_created_at_notification_id_idx').on(
    table.recipientUserId,
    table.createdAt,
    table.notificationId,
  ),
]);

export const mastodonMarkersTable = sqliteTable('mastodon_markers', {
  userId: text('userId').notNull().references(() => usersTable.userId),
  timeline: text('timeline', { enum: ['home', 'notifications'] }).notNull(),
  lastReadId: text('lastReadId').notNull(),
  version: integer('version').notNull(),
  updatedAt: timestamp().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.timeline] }),
]);

export const aiSummaryUsagesTable = sqliteTable('ai_summary_usages', {
  userId: text('userId').notNull().references(() => usersTable.userId),
  day: text('day').notNull(),
  count: integer('count').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.day] }),
]);

export const aiTranslationUsagesTable = sqliteTable('ai_translation_usages', {
  userId: text('userId').notNull().references(() => usersTable.userId),
  day: text('day').notNull(),
  count: integer('count').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.day] }),
]);

export const postTranslationsTable = sqliteTable('post_translations', {
  postId: text('postId').notNull().references(() => postsTable.postId, { onDelete: 'cascade' }),
  targetLanguage: text('targetLanguage').notNull(),
  sourceHash: text('sourceHash').notNull(),
  content: text('content').notNull(),
  detectedSourceLanguage: text('detectedSourceLanguage').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp().notNull(),
}, (table) => [
  primaryKey({ columns: [table.postId, table.targetLanguage] }),
]);

export const notificationLikesTable = sqliteTable('notification_likes', {
  notificationId: text('notificationId').primaryKey().references(() => notificationsTable.notificationId),
  likerActorId: text('likerActorId').notNull().references(() => actorsTable.actorId),
  likedPostId: text('likedPostId').notNull(),
});

export const notificationFollowsTable = sqliteTable('notification_follows', {
  notificationId: text('notificationId').primaryKey().references(() => notificationsTable.notificationId),
  followerActorId: text('followerActorId').notNull().references(() => actorsTable.actorId),
});

export const notificationRepostsTable = sqliteTable('notification_reposts', {
  notificationId: text('notificationId').primaryKey().references(() => notificationsTable.notificationId),
  reposterActorId: text('reposterActorId').notNull().references(() => actorsTable.actorId),
  repostedPostId: text('repostedPostId').notNull(),
}, (table) => [
  uniqueIndex('notification_reposts_reposter_post_unique').on(table.reposterActorId, table.repostedPostId),
]);

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
  index('reposts_actor_id_created_at_repost_id_idx').on(table.actorId, table.createdAt, table.repostId),
]);

export const timelineItemsTable = sqliteTable('timeline_items', {
  timelineItemId: text('timelineItemId').primaryKey(),
  type: text('type').notNull(),
  actorId: text('actorId').notNull().references(() => actorsTable.actorId),
  postId: text('postId').notNull(),
  repostId: text('repostId'),
  createdAt: timestamp().notNull(),
  deletedAt: timestamp(),
}, (table) => [
  index('timeline_items_created_at_id_idx').on(table.createdAt, table.timelineItemId),
]);

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
  rootPostId: text('rootPostId').references(() => postsTable.postId),
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

export const articleBodiesTable = sqliteTable('article_bodies', {
  articleId: text('articleId').primaryKey().references(() => articlesTable.articleId),
  privateHtml: text('privateHtml').notNull(),
  publicHtml: text('publicHtml').notNull(),
  markdown: text('markdown'),
  updatedAt: timestamp().notNull(),
});

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
  index('federated_timeline_items_received_at_id_idx').on(table.receivedAt, table.federatedTimelineItemId),
  index('federated_timeline_items_post_id_idx').on(table.postId),
  uniqueIndex('federated_timeline_items_post_id_relay_id_unique').on(table.postId, table.relayId),
]);

export const oauthApplicationsTable = sqliteTable('oauth_applications', {
  id: text('id').primaryKey(),
  clientId: text('clientId').notNull(),
  clientSecretHash: text('clientSecretHash').notNull(),
  name: text('name').notNull(),
  website: text('website'),
  redirectUris: text('redirectUris').notNull(),
  scopes: text('scopes').notNull(),
  createdAt: timestamp().notNull(),
}, (table) => [
  uniqueIndex('oauth_applications_client_id_unique').on(table.clientId),
]);

export const oauthAuthorizationCodesTable = sqliteTable('oauth_authorization_codes', {
  codeHash: text('codeHash').primaryKey(),
  applicationId: text('applicationId').notNull().references(() => oauthApplicationsTable.id),
  userId: text('userId').notNull().references(() => usersTable.userId),
  redirectUri: text('redirectUri').notNull(),
  scopes: text('scopes').notNull(),
  codeChallenge: text('codeChallenge'),
  codeChallengeMethod: text('codeChallengeMethod'),
  expiresAt: timestamp().notNull(),
  consumedAt: timestamp(),
  createdAt: timestamp().notNull(),
});

export const oauthAccessTokensTable = sqliteTable('oauth_access_tokens', {
  id: text('id').primaryKey(),
  tokenHash: text('tokenHash').notNull(),
  applicationId: text('applicationId').notNull().references(() => oauthApplicationsTable.id),
  userId: text('userId').references(() => usersTable.userId),
  authorizationCodeHash: text('authorizationCodeHash'),
  scopes: text('scopes').notNull(),
  createdAt: timestamp().notNull(),
  revokedAt: timestamp(),
  lastUsedAt: timestamp(),
}, (table) => [
  uniqueIndex('oauth_access_tokens_token_hash_unique').on(table.tokenHash),
  index('oauth_access_tokens_authorization_code_hash_idx').on(table.authorizationCodeHash),
]);

export const feedSourcesTable = sqliteTable('feed_sources', {
  feedSourceId: text('feedSourceId').primaryKey(),
  kind: text('kind').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  etag: text('etag'),
  lastModified: text('lastModified'),
  lastFetchedAt: timestamp(),
  lastError: text('lastError'),
  createdAt: timestamp().notNull(),
}, (table) => [
  uniqueIndex('feed_sources_url_unique').on(table.url),
]);

export const feedEntriesTable = sqliteTable('feed_entries', {
  feedEntryId: text('feedEntryId').primaryKey(),
  feedSourceId: text('feedSourceId').notNull().references(() => feedSourcesTable.feedSourceId),
  guid: text('guid').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  publishedAt: timestamp(),
  hatenaBookmarkCount: integer('hatenaBookmarkCount'),
  fetchedAt: timestamp().notNull(),
  embedding: embeddingBlob('embedding'),
  embeddedAt: timestamp(),
}, (table) => [
  uniqueIndex('feed_entries_feed_source_guid_unique').on(table.feedSourceId, table.guid),
  index('feed_entries_url_idx').on(table.url),
  index('feed_entries_published_at_idx').on(table.publishedAt),
  index('feed_entries_fetched_at_idx').on(table.fetchedAt),
  index('feed_entries_embedded_at_fetched_at_idx').on(table.embeddedAt, table.fetchedAt),
]);

export const digestSubscriptionsTable = sqliteTable('digest_subscriptions', {
  userId: text('userId').primaryKey().references(() => usersTable.userId),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
});

export const digestsTable = sqliteTable('digests', {
  digestId: text('digestId').primaryKey(),
  userId: text('userId').notNull().references(() => usersTable.userId),
  digestDate: text('digestDate').notNull(),
  articleId: text('articleId').notNull().references(() => articlesTable.articleId),
  createdAt: timestamp().notNull(),
  pushSentAt: timestamp(),
  trigger: text('trigger').notNull().default('scheduled'),
  topicKey: text('topicKey').notNull().default('summary'),
}, (table) => [
  uniqueIndex('digests_user_id_digest_date_topic_key_unique').on(table.userId, table.digestDate, table.topicKey),
  index('digests_digest_date_idx').on(table.digestDate),
]);

export const digestTopicsTable = sqliteTable('digest_topics', {
  userId: text('userId').notNull().references(() => usersTable.userId),
  topicKey: text('topicKey').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  embedding: embeddingBlob('embedding'),
  embeddedAt: timestamp(),
  sortOrder: integer('sortOrder').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.topicKey] }),
]);

export const digestRequestUsagesTable = sqliteTable('digest_request_usages', {
  userId: text('userId').notNull().references(() => usersTable.userId),
  day: text('day').notNull(),
  count: integer('count').notNull(),
  lastRequestedAt: timestamp().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.day] }),
]);

export const digestItemsTable = sqliteTable('digest_items', {
  digestItemId: text('digestItemId').primaryKey(),
  digestId: text('digestId').notNull().references(() => digestsTable.digestId),
  feedEntryId: text('feedEntryId').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  rank: integer('rank').notNull(),
  score: real('score'),
  summary: text('summary'),
  reasonInterestSourceId: text('reasonInterestSourceId'),
  feedback: text('feedback'),
  feedbackAt: timestamp(),
}, (table) => [
  uniqueIndex('digest_items_digest_id_rank_unique').on(table.digestId, table.rank),
]);

export const digestDeepDivesTable = sqliteTable('digest_deep_dives', {
  deepDiveId: text('deepDiveId').primaryKey(),
  userId: text('userId').notNull().references(() => usersTable.userId),
  digestItemId: text('digestItemId').notNull(),
  articleId: text('articleId').notNull(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
}, (table) => [
  uniqueIndex('digest_deep_dives_digest_item_id_unique').on(table.digestItemId),
]);

export const digestDeepDiveTurnsTable = sqliteTable('digest_deep_dive_turns', {
  turnId: text('turnId').primaryKey(),
  deepDiveId: text('deepDiveId').notNull().references(() => digestDeepDivesTable.deepDiveId),
  turnNumber: integer('turnNumber').notNull(),
  instruction: text('instruction').notNull(),
  resultMarkdown: text('resultMarkdown').notNull(),
  createdAt: timestamp().notNull(),
}, (table) => [
  uniqueIndex('digest_deep_dive_turns_deep_dive_id_turn_number_unique').on(table.deepDiveId, table.turnNumber),
]);

export const digestDeepDiveUsagesTable = sqliteTable('digest_deep_dive_usages', {
  userId: text('userId').notNull().references(() => usersTable.userId),
  day: text('day').notNull(),
  count: integer('count').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.day] }),
]);

export const digestTrendsTable = sqliteTable('digest_trends', {
  digestId: text('digestId').notNull().references(() => digestsTable.digestId),
  kind: text('kind').notNull(),
  rank: integer('rank').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  count: integer('count').notNull(),
}, (table) => [
  primaryKey({ columns: [table.digestId, table.kind, table.rank] }),
]);

export const interestSourcesTable = sqliteTable('interest_sources', {
  interestSourceId: text('interestSourceId').primaryKey(),
  userId: text('userId').notNull().references(() => usersTable.userId),
  kind: text('kind').notNull(),
  ref: text('ref').notNull(),
  contentHash: text('contentHash').notNull(),
  weight: real('weight').notNull(),
  occurredAt: timestamp().notNull(),
  embedding: embeddingBlob('embedding'),
  embeddedAt: timestamp(),
  deletedAt: timestamp(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
}, (table) => [
  uniqueIndex('interest_sources_user_id_kind_ref_unique').on(table.userId, table.kind, table.ref),
  index('interest_sources_user_id_embedded_at_deleted_at_idx').on(table.userId, table.embeddedAt, table.deletedAt),
]);

export const blueskySessionsTable = sqliteTable('bluesky_sessions', {
  id: text('id').primaryKey(),
  did: text('did').notNull(),
  handle: text('handle').notNull(),
  pdsUrl: text('pdsUrl').notNull(),
  accessJwt: text('accessJwt').notNull(),
  refreshJwt: text('refreshJwt').notNull(),
  updatedAt: timestamp().notNull(),
});

export const blueskyCrosspostsTable = sqliteTable('bluesky_crossposts', {
  postId: text('postId').primaryKey(),
  status: text('status').notNull(),
  skipReason: text('skipReason'),
  uri: text('uri'),
  cid: text('cid'),
  rkey: text('rkey'),
  rootUri: text('rootUri'),
  rootCid: text('rootCid'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('lastError'),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
}, (table) => [
  index('bluesky_crossposts_status_created_at_idx').on(table.status, table.createdAt),
]);

export const blueskyTimelineItemsTable = sqliteTable('bluesky_timeline_items', {
  feedItemId: text('feedItemId').primaryKey(),
  uri: text('uri').notNull(),
  cid: text('cid').notNull(),
  authorDid: text('authorDid').notNull(),
  authorHandle: text('authorHandle').notNull(),
  authorDisplayName: text('authorDisplayName'),
  authorAvatar: text('authorAvatar'),
  text: text('text').notNull(),
  facets: text('facets').notNull(),
  embed: text('embed'),
  replyParentUri: text('replyParentUri'),
  replyParentAuthorHandle: text('replyParentAuthorHandle'),
  repostedByDid: text('repostedByDid'),
  repostedByHandle: text('repostedByHandle'),
  postedAt: timestamp().notNull(),
  indexedAt: timestamp().notNull(),
  fetchedAt: timestamp().notNull(),
}, (table) => [
  index('bluesky_timeline_items_indexed_at_idx').on(table.indexedAt),
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
  remotePostRecipientsTable,
  localPostsTable,
  likesTable,
  localLikesTable,
  remoteLikesTable,
  postImagesTable,
  mediaUploadsTable,
  notificationsTable,
  mastodonMarkersTable,
  aiSummaryUsagesTable,
  aiTranslationUsagesTable,
  postTranslationsTable,
  notificationLikesTable,
  notificationFollowsTable,
  pushSubscriptionsTable,
  repostsTable,
  timelineItemsTable,
  instanceActorKeysTable,
  emojiReactsTable,
  notificationEmojiReactsTable,
  notificationRepliesTable,
  notificationRepostsTable,
  mutesTable,
  articlesTable,
  articleBodiesTable,
  linkPreviewsTable,
  relaysTable,
  federatedTimelineItemsTable,
  oauthApplicationsTable,
  oauthAuthorizationCodesTable,
  oauthAccessTokensTable,
  feedSourcesTable,
  feedEntriesTable,
  digestSubscriptionsTable,
  digestsTable,
  digestTopicsTable,
  digestRequestUsagesTable,
  digestItemsTable,
  digestDeepDivesTable,
  digestDeepDiveTurnsTable,
  digestDeepDiveUsagesTable,
  digestTrendsTable,
  interestSourcesTable,
  blueskySessionsTable,
  blueskyCrosspostsTable,
  blueskyTimelineItemsTable,
} as const;
