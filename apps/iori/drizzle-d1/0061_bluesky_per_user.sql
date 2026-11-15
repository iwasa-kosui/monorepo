-- 既存の Bluesky のデータはオーナー（kosui）のものとして引き継ぐ。オーナーがいない DB では引き継ぐ先がないので捨てる
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_bluesky_bookmarks` (
	`userId` text NOT NULL,
	`subjectUri` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `subjectUri`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_bluesky_bookmarks`("userId", "subjectUri", "createdAt") SELECT (SELECT `userId` FROM `users` WHERE `username` = 'kosui') AS "userId", "subjectUri", "createdAt" FROM `bluesky_bookmarks` WHERE (SELECT `userId` FROM `users` WHERE `username` = 'kosui') IS NOT NULL;--> statement-breakpoint
DROP TABLE `bluesky_bookmarks`;--> statement-breakpoint
ALTER TABLE `__new_bluesky_bookmarks` RENAME TO `bluesky_bookmarks`;--> statement-breakpoint
CREATE TABLE `__new_bluesky_chat_push_receipts` (
	`userId` text NOT NULL,
	`convoId` text NOT NULL,
	`lastMessageId` text NOT NULL,
	`notifiedAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `convoId`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_bluesky_chat_push_receipts`("userId", "convoId", "lastMessageId", "notifiedAt") SELECT (SELECT `userId` FROM `users` WHERE `username` = 'kosui') AS "userId", "convoId", "lastMessageId", "notifiedAt" FROM `bluesky_chat_push_receipts` WHERE (SELECT `userId` FROM `users` WHERE `username` = 'kosui') IS NOT NULL;--> statement-breakpoint
DROP TABLE `bluesky_chat_push_receipts`;--> statement-breakpoint
ALTER TABLE `__new_bluesky_chat_push_receipts` RENAME TO `bluesky_chat_push_receipts`;--> statement-breakpoint
CREATE TABLE `__new_bluesky_likes` (
	`userId` text NOT NULL,
	`subjectUri` text NOT NULL,
	`likeUri` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `subjectUri`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_bluesky_likes`("userId", "subjectUri", "likeUri", "createdAt") SELECT (SELECT `userId` FROM `users` WHERE `username` = 'kosui') AS "userId", "subjectUri", "likeUri", "createdAt" FROM `bluesky_likes` WHERE (SELECT `userId` FROM `users` WHERE `username` = 'kosui') IS NOT NULL;--> statement-breakpoint
DROP TABLE `bluesky_likes`;--> statement-breakpoint
ALTER TABLE `__new_bluesky_likes` RENAME TO `bluesky_likes`;--> statement-breakpoint
CREATE TABLE `__new_bluesky_login_failures` (
	`userId` text NOT NULL,
	`scope` text NOT NULL,
	`failedAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `scope`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_bluesky_login_failures`("userId", "scope", "failedAt") SELECT (SELECT `userId` FROM `users` WHERE `username` = 'kosui') AS "userId", "scope", "failedAt" FROM `bluesky_login_failures` WHERE (SELECT `userId` FROM `users` WHERE `username` = 'kosui') IS NOT NULL;--> statement-breakpoint
DROP TABLE `bluesky_login_failures`;--> statement-breakpoint
ALTER TABLE `__new_bluesky_login_failures` RENAME TO `bluesky_login_failures`;--> statement-breakpoint
CREATE TABLE `__new_bluesky_moderated_actors` (
	`userId` text NOT NULL,
	`did` text NOT NULL,
	`muted` integer DEFAULT 0 NOT NULL,
	`blockUri` text,
	`updatedAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `did`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_bluesky_moderated_actors`("userId", "did", "muted", "blockUri", "updatedAt") SELECT (SELECT `userId` FROM `users` WHERE `username` = 'kosui') AS "userId", "did", "muted", "blockUri", "updatedAt" FROM `bluesky_moderated_actors` WHERE (SELECT `userId` FROM `users` WHERE `username` = 'kosui') IS NOT NULL;--> statement-breakpoint
DROP TABLE `bluesky_moderated_actors`;--> statement-breakpoint
ALTER TABLE `__new_bluesky_moderated_actors` RENAME TO `bluesky_moderated_actors`;--> statement-breakpoint
CREATE TABLE `__new_bluesky_notification_receipts` (
	`userId` text NOT NULL,
	`uri` text NOT NULL,
	`indexedAt` integer NOT NULL,
	`receivedAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `uri`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_bluesky_notification_receipts`("userId", "uri", "indexedAt", "receivedAt") SELECT (SELECT `userId` FROM `users` WHERE `username` = 'kosui') AS "userId", "uri", "indexedAt", "receivedAt" FROM `bluesky_notification_receipts` WHERE (SELECT `userId` FROM `users` WHERE `username` = 'kosui') IS NOT NULL;--> statement-breakpoint
DROP TABLE `bluesky_notification_receipts`;--> statement-breakpoint
ALTER TABLE `__new_bluesky_notification_receipts` RENAME TO `bluesky_notification_receipts`;--> statement-breakpoint
CREATE INDEX `bluesky_notification_receipts_indexed_at_idx` ON `bluesky_notification_receipts` (`indexedAt`);--> statement-breakpoint
CREATE TABLE `__new_bluesky_reposts` (
	`userId` text NOT NULL,
	`subjectUri` text NOT NULL,
	`repostUri` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `subjectUri`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_bluesky_reposts`("userId", "subjectUri", "repostUri", "createdAt") SELECT (SELECT `userId` FROM `users` WHERE `username` = 'kosui') AS "userId", "subjectUri", "repostUri", "createdAt" FROM `bluesky_reposts` WHERE (SELECT `userId` FROM `users` WHERE `username` = 'kosui') IS NOT NULL;--> statement-breakpoint
DROP TABLE `bluesky_reposts`;--> statement-breakpoint
ALTER TABLE `__new_bluesky_reposts` RENAME TO `bluesky_reposts`;--> statement-breakpoint
CREATE TABLE `__new_bluesky_sync_status` (
	`userId` text NOT NULL,
	`scope` text NOT NULL,
	`lastSucceededAt` integer,
	`lastFailedAt` integer,
	`lastFailureKind` text,
	`lastFailureCode` text,
	PRIMARY KEY(`userId`, `scope`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_bluesky_sync_status`("userId", "scope", "lastSucceededAt", "lastFailedAt", "lastFailureKind", "lastFailureCode") SELECT (SELECT `userId` FROM `users` WHERE `username` = 'kosui') AS "userId", "scope", "lastSucceededAt", "lastFailedAt", "lastFailureKind", "lastFailureCode" FROM `bluesky_sync_status` WHERE (SELECT `userId` FROM `users` WHERE `username` = 'kosui') IS NOT NULL;--> statement-breakpoint
DROP TABLE `bluesky_sync_status`;--> statement-breakpoint
ALTER TABLE `__new_bluesky_sync_status` RENAME TO `bluesky_sync_status`;--> statement-breakpoint
CREATE TABLE `__new_bluesky_timeline_items` (
	`userId` text NOT NULL,
	`feedItemId` text NOT NULL,
	`uri` text NOT NULL,
	`cid` text NOT NULL,
	`authorDid` text NOT NULL,
	`authorHandle` text NOT NULL,
	`authorDisplayName` text,
	`authorAvatar` text,
	`text` text NOT NULL,
	`facets` text NOT NULL,
	`embed` text,
	`replyParentUri` text,
	`replyParentAuthorHandle` text,
	`repostedByDid` text,
	`repostedByHandle` text,
	`bridgyOriginalUrl` text,
	`postedAt` integer NOT NULL,
	`indexedAt` integer NOT NULL,
	`fetchedAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `feedItemId`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_bluesky_timeline_items`("userId", "feedItemId", "uri", "cid", "authorDid", "authorHandle", "authorDisplayName", "authorAvatar", "text", "facets", "embed", "replyParentUri", "replyParentAuthorHandle", "repostedByDid", "repostedByHandle", "bridgyOriginalUrl", "postedAt", "indexedAt", "fetchedAt") SELECT (SELECT `userId` FROM `users` WHERE `username` = 'kosui') AS "userId", "feedItemId", "uri", "cid", "authorDid", "authorHandle", "authorDisplayName", "authorAvatar", "text", "facets", "embed", "replyParentUri", "replyParentAuthorHandle", "repostedByDid", "repostedByHandle", "bridgyOriginalUrl", "postedAt", "indexedAt", "fetchedAt" FROM `bluesky_timeline_items` WHERE (SELECT `userId` FROM `users` WHERE `username` = 'kosui') IS NOT NULL;--> statement-breakpoint
DROP TABLE `bluesky_timeline_items`;--> statement-breakpoint
ALTER TABLE `__new_bluesky_timeline_items` RENAME TO `bluesky_timeline_items`;--> statement-breakpoint
CREATE INDEX `bluesky_timeline_items_indexed_at_idx` ON `bluesky_timeline_items` (`indexedAt`);--> statement-breakpoint
CREATE INDEX `bluesky_timeline_items_user_id_indexed_at_idx` ON `bluesky_timeline_items` (`userId`,`indexedAt`);--> statement-breakpoint
CREATE INDEX `bluesky_timeline_items_uri_idx` ON `bluesky_timeline_items` (`uri`);--> statement-breakpoint
CREATE TABLE `__new_bluesky_account_switch` (
	`userId` text PRIMARY KEY NOT NULL,
	`switchId` text NOT NULL,
	`fromDid` text NOT NULL,
	`toDid` text NOT NULL,
	`startedAt` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lastError` text,
	`deletedCounts` text NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_bluesky_account_switch`("userId", "switchId", "fromDid", "toDid", "startedAt", "attempts", "lastError", "deletedCounts", "updatedAt") SELECT (SELECT `userId` FROM `users` WHERE `username` = 'kosui') AS "userId", "switchId", "fromDid", "toDid", "startedAt", "attempts", "lastError", "deletedCounts", "updatedAt" FROM `bluesky_account_switch` WHERE (SELECT `userId` FROM `users` WHERE `username` = 'kosui') IS NOT NULL;--> statement-breakpoint
DROP TABLE `bluesky_account_switch`;--> statement-breakpoint
ALTER TABLE `__new_bluesky_account_switch` RENAME TO `bluesky_account_switch`;--> statement-breakpoint
CREATE TABLE `__new_bluesky_credentials` (
	`userId` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`did` text NOT NULL,
	`handle` text NOT NULL,
	`appPasswordCiphertext` text NOT NULL,
	`appPasswordIv` text NOT NULL,
	`keyVersion` integer NOT NULL,
	`chatPermitted` integer,
	`verifiedAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_bluesky_credentials`("userId", "identifier", "did", "handle", "appPasswordCiphertext", "appPasswordIv", "keyVersion", "chatPermitted", "verifiedAt", "updatedAt") SELECT (SELECT `userId` FROM `users` WHERE `username` = 'kosui') AS "userId", "identifier", "did", "handle", "appPasswordCiphertext", "appPasswordIv", "keyVersion", "chatPermitted", "verifiedAt", "updatedAt" FROM `bluesky_credentials` WHERE (SELECT `userId` FROM `users` WHERE `username` = 'kosui') IS NOT NULL;--> statement-breakpoint
DROP TABLE `bluesky_credentials`;--> statement-breakpoint
ALTER TABLE `__new_bluesky_credentials` RENAME TO `bluesky_credentials`;--> statement-breakpoint
CREATE UNIQUE INDEX `bluesky_credentials_did_unique` ON `bluesky_credentials` (`did`);--> statement-breakpoint
CREATE TABLE `__new_bluesky_notification_sync_state` (
	`userId` text PRIMARY KEY NOT NULL,
	`initialSyncCompletedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_bluesky_notification_sync_state`("userId", "initialSyncCompletedAt") SELECT (SELECT `userId` FROM `users` WHERE `username` = 'kosui') AS "userId", "initialSyncCompletedAt" FROM `bluesky_notification_sync_state` WHERE (SELECT `userId` FROM `users` WHERE `username` = 'kosui') IS NOT NULL;--> statement-breakpoint
DROP TABLE `bluesky_notification_sync_state`;--> statement-breakpoint
ALTER TABLE `__new_bluesky_notification_sync_state` RENAME TO `bluesky_notification_sync_state`;--> statement-breakpoint
CREATE TABLE `__new_bluesky_sessions` (
	`userId` text PRIMARY KEY NOT NULL,
	`did` text NOT NULL,
	`handle` text NOT NULL,
	`pdsUrl` text NOT NULL,
	`accessJwt` text NOT NULL,
	`refreshJwt` text NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_bluesky_sessions`("userId", "did", "handle", "pdsUrl", "accessJwt", "refreshJwt", "updatedAt") SELECT (SELECT `userId` FROM `users` WHERE `username` = 'kosui') AS "userId", "did", "handle", "pdsUrl", "accessJwt", "refreshJwt", "updatedAt" FROM `bluesky_sessions` WHERE (SELECT `userId` FROM `users` WHERE `username` = 'kosui') IS NOT NULL;--> statement-breakpoint
DROP TABLE `bluesky_sessions`;--> statement-breakpoint
ALTER TABLE `__new_bluesky_sessions` RENAME TO `bluesky_sessions`;--> statement-breakpoint
CREATE TABLE `__new_notification_bluesky` (
	`notificationId` text PRIMARY KEY NOT NULL,
	`recipientUserId` text NOT NULL,
	`blueskyUri` text NOT NULL,
	`reason` text NOT NULL,
	`authorDid` text NOT NULL,
	`authorHandle` text NOT NULL,
	`authorDisplayName` text,
	`authorAvatar` text,
	`subjectUri` text,
	`targetPostId` text,
	`text` text,
	FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`notificationId`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_notification_bluesky`("notificationId", "recipientUserId", "blueskyUri", "reason", "authorDid", "authorHandle", "authorDisplayName", "authorAvatar", "subjectUri", "targetPostId", "text") SELECT nb."notificationId", n."recipientUserId", nb."blueskyUri", nb."reason", nb."authorDid", nb."authorHandle", nb."authorDisplayName", nb."authorAvatar", nb."subjectUri", nb."targetPostId", nb."text" FROM `notification_bluesky` nb INNER JOIN `notifications` n ON n."notificationId" = nb."notificationId";--> statement-breakpoint
DROP TABLE `notification_bluesky`;--> statement-breakpoint
ALTER TABLE `__new_notification_bluesky` RENAME TO `notification_bluesky`;--> statement-breakpoint
CREATE UNIQUE INDEX `notification_bluesky_recipient_user_id_bluesky_uri_unique` ON `notification_bluesky` (`recipientUserId`,`blueskyUri`);--> statement-breakpoint
CREATE TABLE `__new_bluesky_crossposts` (
	`postId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`status` text NOT NULL,
	`skipReason` text,
	`uri` text,
	`cid` text,
	`rkey` text,
	`rootUri` text,
	`rootCid` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lastError` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_bluesky_crossposts`("postId", "userId", "status", "skipReason", "uri", "cid", "rkey", "rootUri", "rootCid", "attempts", "lastError", "createdAt", "updatedAt") SELECT c."postId", lp."userId", c."status", c."skipReason", c."uri", c."cid", c."rkey", c."rootUri", c."rootCid", c."attempts", c."lastError", c."createdAt", c."updatedAt" FROM `bluesky_crossposts` c INNER JOIN `local_posts` lp ON lp."postId" = c."postId";--> statement-breakpoint
DROP TABLE `bluesky_crossposts`;--> statement-breakpoint
ALTER TABLE `__new_bluesky_crossposts` RENAME TO `bluesky_crossposts`;--> statement-breakpoint
CREATE INDEX `bluesky_crossposts_status_created_at_idx` ON `bluesky_crossposts` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `bluesky_crossposts_uri_idx` ON `bluesky_crossposts` (`uri`);--> statement-breakpoint
CREATE INDEX `bluesky_crossposts_user_id_idx` ON `bluesky_crossposts` (`userId`);
