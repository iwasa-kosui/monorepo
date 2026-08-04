CREATE TABLE `actors` (
	`actorId` text PRIMARY KEY NOT NULL,
	`uri` text NOT NULL,
	`logoUri` text,
	`inboxUrl` text NOT NULL,
	`type` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actors_uri_unique` ON `actors` (`uri`);--> statement-breakpoint
CREATE UNIQUE INDEX `actors_inboxUrl_unique` ON `actors` (`inboxUrl`);--> statement-breakpoint
CREATE TABLE `articles` (
	`articleId` text PRIMARY KEY NOT NULL,
	`authorActorId` text NOT NULL,
	`authorUserId` text NOT NULL,
	`rootPostId` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`createdAt` integer NOT NULL,
	`publishedAt` integer,
	`unpublishedAt` integer,
	FOREIGN KEY (`authorActorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authorUserId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rootPostId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `articles_author_actor_id_idx` ON `articles` (`authorActorId`);--> statement-breakpoint
CREATE INDEX `articles_root_post_id_idx` ON `articles` (`rootPostId`);--> statement-breakpoint
CREATE UNIQUE INDEX `article_root_post_unique` ON `articles` (`rootPostId`);--> statement-breakpoint
CREATE TABLE `domain_events` (
	`eventId` text PRIMARY KEY NOT NULL,
	`aggregateId` text NOT NULL,
	`aggregateName` text NOT NULL,
	`aggregateState` text,
	`eventName` text NOT NULL,
	`eventPayload` text,
	`occurredAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `emoji_reacts` (
	`emojiReactId` text PRIMARY KEY NOT NULL,
	`actorId` text NOT NULL,
	`postId` text NOT NULL,
	`emoji` text NOT NULL,
	`emojiReactActivityUri` text,
	`emojiImageUrl` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`actorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `emoji_react_actor_post_emoji_unique` ON `emoji_reacts` (`actorId`,`postId`,`emoji`);--> statement-breakpoint
CREATE UNIQUE INDEX `emoji_reacts_emojiReactActivityUri_unique` ON `emoji_reacts` (`emojiReactActivityUri`);--> statement-breakpoint
CREATE TABLE `federated_timeline_items` (
	`federatedTimelineItemId` text PRIMARY KEY NOT NULL,
	`postId` text NOT NULL,
	`relayId` text NOT NULL,
	`receivedAt` integer NOT NULL,
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`relayId`) REFERENCES `relays`(`relayId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `federated_timeline_items_received_at_idx` ON `federated_timeline_items` (`receivedAt`);--> statement-breakpoint
CREATE INDEX `federated_timeline_items_post_id_idx` ON `federated_timeline_items` (`postId`);--> statement-breakpoint
CREATE TABLE `follows` (
	`followerId` text NOT NULL,
	`followingId` text NOT NULL,
	FOREIGN KEY (`followerId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`followingId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `follower_following_unique` ON `follows` (`followerId`,`followingId`);--> statement-breakpoint
CREATE TABLE `instance_actor_keys` (
	`keyId` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`privateKey` text NOT NULL,
	`publicKey` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instance_actor_keys_type_unique` ON `instance_actor_keys` (`type`);--> statement-breakpoint
CREATE TABLE `keys` (
	`keyId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`privateKey` text NOT NULL,
	`publicKey` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_key_type_unique` ON `keys` (`userId`,`type`);--> statement-breakpoint
CREATE TABLE `likes` (
	`likeId` text PRIMARY KEY NOT NULL,
	`actorId` text NOT NULL,
	`postId` text NOT NULL,
	`type` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`actorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `like_actor_post_unique` ON `likes` (`actorId`,`postId`);--> statement-breakpoint
CREATE TABLE `link_previews` (
	`linkPreviewId` text PRIMARY KEY NOT NULL,
	`postId` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`description` text,
	`imageUrl` text,
	`faviconUrl` text,
	`siteName` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `link_previews_post_id_idx` ON `link_previews` (`postId`);--> statement-breakpoint
CREATE TABLE `local_actors` (
	`actorId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	FOREIGN KEY (`actorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_actor_user_unique` ON `local_actors` (`userId`);--> statement-breakpoint
CREATE TABLE `local_likes` (
	`likeId` text PRIMARY KEY NOT NULL,
	FOREIGN KEY (`likeId`) REFERENCES `likes`(`likeId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `local_posts` (
	`postId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`inReplyToUri` text,
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `mutes` (
	`muteId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`mutedActorId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mutedActorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mute_user_actor_unique` ON `mutes` (`userId`,`mutedActorId`);--> statement-breakpoint
CREATE INDEX `mutes_user_id_idx` ON `mutes` (`userId`);--> statement-breakpoint
CREATE INDEX `mutes_muted_actor_id_idx` ON `mutes` (`mutedActorId`);--> statement-breakpoint
CREATE TABLE `notification_emoji_reacts` (
	`notificationId` text PRIMARY KEY NOT NULL,
	`reactorActorId` text NOT NULL,
	`reactedPostId` text NOT NULL,
	`emoji` text NOT NULL,
	`emojiImageUrl` text,
	FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`notificationId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reactorActorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_follows` (
	`notificationId` text PRIMARY KEY NOT NULL,
	`followerActorId` text NOT NULL,
	FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`notificationId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`followerActorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_likes` (
	`notificationId` text PRIMARY KEY NOT NULL,
	`likerActorId` text NOT NULL,
	`likedPostId` text NOT NULL,
	FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`notificationId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`likerActorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_replies` (
	`notificationId` text PRIMARY KEY NOT NULL,
	`replierActorId` text NOT NULL,
	`replyPostId` text NOT NULL,
	`originalPostId` text NOT NULL,
	FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`notificationId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`replierActorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notification_replies_reply_post_id_idx` ON `notification_replies` (`replyPostId`);--> statement-breakpoint
CREATE INDEX `notification_replies_original_post_id_idx` ON `notification_replies` (`originalPostId`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`notificationId` text PRIMARY KEY NOT NULL,
	`recipientUserId` text NOT NULL,
	`type` text NOT NULL,
	`isRead` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `post_images` (
	`imageId` text PRIMARY KEY NOT NULL,
	`postId` text NOT NULL,
	`url` text NOT NULL,
	`altText` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`postId` text PRIMARY KEY NOT NULL,
	`actorId` text NOT NULL,
	`content` text NOT NULL,
	`createdAt` integer NOT NULL,
	`type` text NOT NULL,
	`deletedAt` integer,
	FOREIGN KEY (`actorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`subscriptionId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dhKey` text NOT NULL,
	`authKey` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `relays` (
	`relayId` text PRIMARY KEY NOT NULL,
	`inboxUrl` text NOT NULL,
	`actorUri` text NOT NULL,
	`status` text NOT NULL,
	`createdAt` integer NOT NULL,
	`acceptedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `relays_inboxUrl_unique` ON `relays` (`inboxUrl`);--> statement-breakpoint
CREATE UNIQUE INDEX `relays_actorUri_unique` ON `relays` (`actorUri`);--> statement-breakpoint
CREATE TABLE `remote_actors` (
	`actorId` text PRIMARY KEY NOT NULL,
	`url` text,
	`username` text,
	FOREIGN KEY (`actorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `remote_likes` (
	`likeId` text PRIMARY KEY NOT NULL,
	`likeActivityUri` text NOT NULL,
	FOREIGN KEY (`likeId`) REFERENCES `likes`(`likeId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `remote_likes_likeActivityUri_unique` ON `remote_likes` (`likeActivityUri`);--> statement-breakpoint
CREATE TABLE `remote_posts` (
	`postId` text PRIMARY KEY NOT NULL,
	`uri` text NOT NULL,
	`inReplyToUri` text,
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `remote_posts_uri_unique` ON `remote_posts` (`uri`);--> statement-breakpoint
CREATE TABLE `reposts` (
	`repostId` text PRIMARY KEY NOT NULL,
	`actorId` text NOT NULL,
	`postId` text NOT NULL,
	`announceActivityUri` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`actorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`postId`) REFERENCES `posts`(`postId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repost_actor_post_unique` ON `reposts` (`actorId`,`postId`);--> statement-breakpoint
CREATE UNIQUE INDEX `reposts_announceActivityUri_unique` ON `reposts` (`announceActivityUri`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`sessionId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `timeline_items` (
	`timelineItemId` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`actorId` text NOT NULL,
	`postId` text NOT NULL,
	`repostId` text,
	`createdAt` integer NOT NULL,
	`deletedAt` integer,
	FOREIGN KEY (`actorId`) REFERENCES `actors`(`actorId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_passwords` (
	`userId` text PRIMARY KEY NOT NULL,
	`algorithm` text NOT NULL,
	`parallelism` integer NOT NULL,
	`tagLength` integer NOT NULL,
	`memory` integer NOT NULL,
	`passes` integer NOT NULL,
	`nonceHex` text NOT NULL,
	`tagHex` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`userId` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);