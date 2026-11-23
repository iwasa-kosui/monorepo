PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__old_digests` AS SELECT * FROM `digests`;--> statement-breakpoint
DROP TABLE `digests`;--> statement-breakpoint
CREATE TABLE `digests` (
	`digestId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`digestDate` text NOT NULL,
	`articleId` text,
	`postId` text,
	`xPostsPostId` text,
	`createdAt` integer NOT NULL,
	`pushSentAt` integer,
	`trigger` text DEFAULT 'scheduled' NOT NULL,
	`topicKey` text DEFAULT 'summary' NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`userId`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `digests`("digestId", "userId", "digestDate", "articleId", "postId", "xPostsPostId", "createdAt", "pushSentAt", "trigger", "topicKey") SELECT "digestId", "userId", "digestDate", "articleId", NULL, NULL, "createdAt", "pushSentAt", "trigger", "topicKey" FROM `__old_digests`;--> statement-breakpoint
DROP TABLE `__old_digests`;--> statement-breakpoint
CREATE INDEX `digests_user_id_digest_date_topic_key_idx` ON `digests` (`userId`,`digestDate`,`topicKey`);--> statement-breakpoint
CREATE INDEX `digests_digest_date_idx` ON `digests` (`digestDate`);--> statement-breakpoint
CREATE INDEX `digests_post_id_idx` ON `digests` (`postId`);--> statement-breakpoint
UPDATE `digest_subscriptions` SET `enabled` = 1, `updatedAt` = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER);
